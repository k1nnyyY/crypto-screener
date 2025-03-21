import { Injectable, Logger } from '@nestjs/common';
import { SshService } from '../../common/ssh/ssh.service';
import { NodeSSH } from 'node-ssh';

interface ServerConfig {
  ip: string;
  password: string;
}

interface ShadowsocksConfig {
  password: string;
  port: number;
}

interface SetupData {
  server_count: number;
  servers: ServerConfig[];
  shadowsocks: ShadowsocksConfig;
  hosts?: string[];
}

@Injectable()
export class SetupService {
  private readonly logger = new Logger(SetupService.name);

  constructor(private readonly sshService: SshService) {}

  private async reconnect(serverIp: string, user: string, password: string): Promise<NodeSSH | null> {
    let attempt = 0;
    while (attempt < 5) {
      try {
        return await this.sshService.connectToServer(serverIp, user, password);
      } catch (error) {
        this.logger.warn(`🔄 Попытка ${attempt + 1}/5 подключения к ${serverIp} не удалась...`);
        attempt++;
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    }
    this.logger.error(`🚨 Не удалось подключиться к ${serverIp} после 5 попыток. Сервер будет пропущен.`);
    return null;
  }
  
  private generateSafeInstallScript(pkg: string): string {
    return `
  bash -e -c '
    echo "📦 Проверка и установка пакета: ${pkg}"
    i=0
    success=0
  
    while [ $i -lt 5 ]; do
      if ! fuser /var/lib/dpkg/lock-frontend >/dev/null 2>&1; then
        echo "⏳ dpkg lock свободен..."
  
        status_line=$(dpkg -l ${pkg} 2>/dev/null | grep ^[a-z] || echo "not-installed")
        echo "📦 Статус dpkg: $status_line"
  
        if echo "$status_line" | grep -q "^ii"; then
          echo "✅ Пакет ${pkg} уже установлен"
          systemctl restart ${pkg} || true
          exit 0
        elif echo "$status_line" | grep -q "^iF"; then
          echo "⚠️ Пакет установлен с ошибкой (iF), пытаемся восстановить..."
          dpkg --configure ${pkg} || true
          systemctl restart ${pkg} || true
          exit 0
        fi
  
        echo "⏬ Установка пакета..."
        DEBIAN_FRONTEND=noninteractive apt update || true
        DEBIAN_FRONTEND=noninteractive apt install -y ${pkg} && success=1 && break
      fi
  
      echo "⏳ Попытка $((i+1)): dpkg занят или ошибка, ждём 5 секунд..."
      i=$((i+1))
      sleep 5
    done
  
    if [ $success -eq 1 ]; then
      echo "✅ Пакет ${pkg} установлен успешно"
      systemctl restart ${pkg} || true
      exit 0
    else
      echo "🚨 Не удалось установить ${pkg} после 5 попыток"
      exit 1
    fi
  '
  `.trim();
  }
  

  
  private async runStepsWithInstallSupport(
    ssh: NodeSSH,
    steps: { description: string; command: string | (() => string) }[],
  ) {
    for (const step of steps) {
      const command = typeof step.command === 'function' ? step.command() : step.command;
      this.logger.log(`${step.description}...`);
      try {
        const output = await this.sshService.executeCommand(ssh, command);
        this.logger.log(`✅ ${step.description} выполнено:\n${output}`);
      } catch (err) {
        this.logger.error(`🚨 Ошибка при шаге: ${step.description}`, err.message);
      }
    }
  }

  async setupServers(data: SetupData): Promise<any> {
    const { servers, shadowsocks, hosts } = data;

    const results = [];

    

    for (const [index, server] of servers.entries()) {
      const role = index === servers.length - 1 ? 'final' : 'intermediate';
      const nextServerIp = servers[index + 1]?.ip;
      try {
        const ssh = await this.reconnect(server.ip, 'root', server.password);
        if (!ssh) {
          results.push({ ip: server.ip, status: 'skipped', message: 'Не удалось подключиться после 5 попыток' });
          continue;
        }
      

      this.logger.log(`🛠 Настройка сервера ${server.ip} (Роль: ${role})`);
      console.log(`🚀 Начало настройки сервера: ${server.ip}`);

      const iptablesSteps = [
        {
          description: '🔄 Включение IP forwarding (в конфиге)',
          command: 'echo "net.ipv4.ip_forward=1" | tee -a /etc/sysctl.conf',
        },
        {
          description: '🔄 Включение IP forwarding (в runtime)',
          command: 'sysctl -w net.ipv4.ip_forward=1',
        },
        {
          description: '📥 Разрешение FORWARD трафика на eth0',
          command: 'iptables -I FORWARD -i eth0 -o eth0 -j ACCEPT',
        },
        {
          description: `📥 Разрешение входящих TCP/UDP на порт ${shadowsocks.port}`,
          command: `
            iptables -I INPUT -p tcp --dport ${shadowsocks.port} -j ACCEPT &&
            iptables -I INPUT -p udp --dport ${shadowsocks.port} -j ACCEPT
          `,
        },
        {
          description: '🌐 NAT Masquerade на eth0',
          command: 'iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE',
        },
        {
          description: '💾 Сохранение iptables правил',
          command: 'iptables-save > /etc/iptables.rules',
        },
      ];
      
      for (const step of iptablesSteps) {
        this.logger.log(`${step.description}...`);
        try {
          const output = await this.sshService.executeCommand(ssh, step.command);
          this.logger.log(`✅ ${step.description} выполнено:\n${output}`);
        } catch (err) {
          this.logger.error(`🚨 Ошибка при шаге: ${step.description}`, err.message);
        }
      }
      
      const shadowsocksSteps = [
        {
          description: '📦 Установка Shadowsocks',
          command: () => this.generateSafeInstallScript('shadowsocks-libev'),
        },  
        {
          description: "Проверка , скачан ли пакет",
          command: " dpkg -l | grep shadowsocks-libev"
        },         
        {
          description: '📁 Создание директории конфигурации',
          command: 'mkdir -p /etc/shadowsocks-libev',
        },
        {
          description: '📝 Создание конфигурационного файла',
          command: `
            echo '{
              "server": ["::0", "0.0.0.0"],
              "mode": "tcp_and_udp",
              "server_port": ${shadowsocks.port},
              "local_port": 1080,
              "password": "${shadowsocks.password}",
              "timeout": 60,
              "fast_open": true,
              "reuse_port": true,
              "no_delay": true,
              "method": "aes-256-gcm"
            }' > /etc/shadowsocks-libev/config.json
          `,
        },
        {
          description: '🔁 Перезапуск Shadowsocks',
          command: 'systemctl restart shadowsocks-libev',
        },
      ];
      
      for (const step of shadowsocksSteps) {
        this.logger.log(`${step.description}...`);
        try {
          const command = typeof step.command === 'function' ? step.command() : step.command;
          const output = await this.sshService.executeCommand(ssh, command);
          this.logger.log(`✅ ${step.description} выполнено:\n${output}`);
        } catch (err) {
          this.logger.error(`🚨 Ошибка при шаге: ${step.description}`, err.message);
        }
      }
      
      if (hosts && hosts.length > 0) {
        const hostEntries = hosts.map((host) => `127.0.0.1 ${host}`).join("\n");
        const hostsOutput = await this.sshService.executeCommand(
          ssh,
          `printf "%s\\n" "${hostEntries}" >> /etc/hosts`
        );
        console.log(`✅ Хосты добавлены на сервере ${server.ip}\n${hostsOutput}`);
      }

      if (role === 'intermediate' && nextServerIp) {
        console.log(`✅ Начало настройки прокси-сервера на ${server.ip}`);
        const proxySetupOutput = await this.sshService.executeCommand(ssh, `
          apt update && apt install -y docker-compose
          cat <<EOF > docker-compose.yml
          version: '3.0'
          services:
            proxy:
              image: nadoo/glider
              container_name: proxy
              ports:
                - "1080:1080"
                - "${shadowsocks.port}:${shadowsocks.port}"
              restart: unless-stopped
              command: -verbose -listen ss://AEAD_AES_256_GCM:${shadowsocks.password}@api:${shadowsocks.port} -forward ss://AEAD_AES_256_GCM:${shadowsocks.password}@${nextServerIp}:${shadowsocks.port}
          EOF
          docker-compose down || true
          docker-compose up -d
        `);
        console.log(`✅ Прокси-сервер настроен на ${server.ip}\n${proxySetupOutput}`);
      }


    this.logger.log(`✅ Сервер ${server.ip} настроен.`);
    results.push({ ip: server.ip, status: 'success' });
    }

    catch (error) {
      this.logger.error(`🚨 Ошибка на сервере ${server.ip}: ${error.message}`);
      results.push({ ip: server.ip, status: 'error', message: error.message });
    }
    }
    this.logger.log('🛠 Выполнение финальных команд...');
    console.log('🚀 Финальная настройка серверов...');

    for (const [index, server] of servers.entries()) {
      const alreadySkipped = results.find(
        (res) => res.ip === server.ip && res.status === 'skipped'
      );
      if (alreadySkipped) {
        this.logger.warn(`⚠️ Сервер ${server.ip} пропущен (финишная настройка) — ранее не удалось подключиться.`);
        continue;
      }      
      const role = index === servers.length - 1 ? 'final' : 'intermediate';
      const nextServerIp = servers[index + 1]?.ip;
      const ssh = await this.reconnect(server.ip, 'root', server.password);
      if (!ssh) {
        this.logger.warn(`⚠️ Сервер ${server.ip} пропущен на этапе финальной настройки`);
        continue;
      }
    
      if (role === 'intermediate' && nextServerIp) {
        const forwardingSteps = [
          {
            description: '🔄 Включение IP forwarding (в runtime)',
            command: 'echo 1 > /proc/sys/net/ipv4/ip_forward && sysctl -w net.ipv4.ip_forward=1',
          },
          {
            description: '📄 Добавление IP forwarding в конфиг',
            command: 'echo "net.ipv4.ip_forward = 1" >> /etc/sysctl.conf && sysctl -p',
          },
          {
            description: '🧯 Очистка iptables и nat таблиц',
            command: `
              sudo iptables -t nat -F &&
              sudo iptables -t nat -X &&
              sudo iptables -F &&
              sudo iptables -X
            `,
          },
          {
            description: '📡 Проброс TCP-трафика на следующий сервер',
            command: `sudo iptables -t nat -A PREROUTING -p tcp --dport ${shadowsocks.port} -j DNAT --to-destination ${nextServerIp}:${shadowsocks.port}`,
          },
          {
            description: '📡 Проброс UDP-трафика на следующий сервер',
            command: `sudo iptables -t nat -A PREROUTING -p udp --dport ${shadowsocks.port} -j DNAT --to-destination ${nextServerIp}:${shadowsocks.port}`,
          },
          {
            description: '🌐 NAT masquerading',
            command: 'sudo iptables -t nat -A POSTROUTING -o ens3 -j MASQUERADE',
          },
          {
            description: '📋 Вывод iptables NAT таблицы',
            command: 'sudo iptables -t nat -L -n -v',
          },
        ];
      
        for (const step of forwardingSteps) {
          this.logger.log(`${step.description}...`);
          try {
            const output = await this.sshService.executeCommand(ssh, step.command);
            this.logger.log(`✅ ${step.description} выполнено:\n${output}`);
          } catch (err) {
            this.logger.error(`🚨 Ошибка при шаге: ${step.description}`, err.message);
          }
        }
      
        this.logger.log(`✅ Проброс портов настроен на ${server.ip}`);
      }
      

      if (role === 'final') {
        console.log("Начало финальной настройки финального сервера")
        const finalSteps = [
          {
            description: '🧯 Очистка iptables',
            command: `
              sudo iptables -F &&
              sudo iptables -X &&
              sudo iptables -t nat -F &&
              sudo iptables -t nat -X
            `,
          },
          {
            description: `🧷 Разрешение входящих соединений на порт ${shadowsocks.port}`,
            command: `
              sudo iptables -A INPUT -p tcp --dport ${shadowsocks.port} -j ACCEPT &&
              sudo iptables -A INPUT -p udp --dport ${shadowsocks.port} -j ACCEPT
            `,
          },
          {
            description: '📤 Разрешение всех исходящих соединений',
            command: 'sudo iptables -A OUTPUT -j ACCEPT',
          },
          {
            description: '💾 Установка iptables-persistent',
            command: () => this.generateSafeInstallScript('iptables-persistent'), 
          },      
          {
            description: "Проверка , скачан ли пакет",
            command: "dpkg -l | grep iptables-persistent"
          },    
          {
            description: '💾 Сохранение правил iptables',
            command: 'netfilter-persistent save',
          },
          {
            description: '🔁 Перезапуск Shadowsocks',
            command: 'systemctl restart shadowsocks-libev',
          },
        ];
        for (const step of finalSteps) {
          this.logger.log(`${step.description}...`);
          try {
            const command = typeof step.command === 'function' ? step.command() : step.command;
            const output = await this.sshService.executeCommand(ssh, command);
            this.logger.log(`✅ ${step.description} выполнено:\n${output}`);
          } catch (err) {
            this.logger.error(`🚨 Ошибка при шаге: ${step.description}`, err.message);
          }
        }
        
        
        console.log(`✅ Финальная настройка завершена на ${server.ip}`);
      }
    }

    this.logger.log('✅ Все серверы настроены.');
    console.log('🎉 Все серверы успешно настроены!');

    const hasErrors = results.some((res) => res.status === 'error');

    return {
      status: hasErrors ? 'error' : 'success',
      results,
    };
    
  }
}