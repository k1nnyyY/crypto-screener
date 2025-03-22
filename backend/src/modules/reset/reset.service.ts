import { Injectable, Logger } from '@nestjs/common';
import { SshService } from '../../common/ssh/ssh.service';

interface ServerConfig {
  ip: string;
  password: string;
}

interface ResetRequest {
  servers: ServerConfig[];
}

@Injectable()
export class ResetService {
  private readonly logger = new Logger(ResetService.name);

  constructor(private readonly sshService: SshService) {}

  async resetServers(data: ResetRequest): Promise<any> {
    this.logger.log('🔄 Сброс конфигурации серверов...');
    const results = [];

    for (const server of data.servers) {
      try {
        const ssh = await this.sshService.connectToServer(server.ip, 'root', server.password);
        this.logger.log(`🛠 Происходит сброс сервера ${server.ip}...`);

        const steps = [
          {
            description: '⛔ Остановка Shadowsocks',
            command: 'systemctl stop shadowsocks-libev || true',
          },
          {
            description: '🧹 Удаление конфигов Shadowsocks',
            command: 'rm -rf /etc/shadowsocks-libev /etc/systemd/system/shadowsocks-libev.service',
          },
          {
            description: '🧼 Удаление Shadowsocks-пакета',
            command: 'apt purge -y shadowsocks-libev || yum remove -y shadowsocks-libev || true',
          },
          {
            description: '🐳 Удаление Docker и docker-compose',
            command: `
              systemctl stop docker || true &&
              apt purge -y docker-ce docker-ce-cli containerd.io docker-compose docker-compose-plugin || true &&
              rm -rf /var/lib/docker /var/lib/containerd /etc/docker &&
              rm -f /usr/local/bin/docker-compose
            `,
          },
          {
            description: '🔥 Очистка iptables',
            command: `
              iptables -F &&
              iptables -X &&
              iptables -t nat -F &&
              iptables -t nat -X &&
              iptables -t mangle -F &&
              iptables -t mangle -X &&
              iptables -P INPUT ACCEPT &&
              iptables -P FORWARD ACCEPT &&
              iptables -P OUTPUT ACCEPT
            `,
          },
          {
            description: '🚫 Отключение IP Forwarding',
            command: `
              sed -i '/net.ipv4.ip_forward/d' /etc/sysctl.conf &&
              echo "net.ipv4.ip_forward=0" >> /etc/sysctl.conf &&
              sysctl -w net.ipv4.ip_forward=0
            `,
          },
          {
            description: '🧽 Очистка crontab',
            command: 'crontab -r || true',
          },
          {
            description: '📁 Очистка /root и временных файлов',
            command: `
              cd /root &&
              find . -maxdepth 1 ! -name '.' ! -name '.bashrc' ! -name '.profile' ! -name '.bash_history' -exec rm -rf {} + &&
              rm -rf /tmp/* /var/tmp/* /var/log/* /root/docker-compose.yml
            `,
          },
          {
            description: '🧼 Очистка Docker мусора',
            command: `
              docker stop $(docker ps -aq) || true &&
              docker rm $(docker ps -aq) || true &&
              docker network prune -f || true &&
              docker volume prune -f || true &&
              docker system prune -a -f || true
            `,
          },
          {
            description: '📜 Очистка истории команд',
            command: 'history -c && echo > ~/.bash_history',
          },
          {
            description: '📦 Автоочистка apt',
            command: 'apt autoremove --purge -y && apt clean',
          },
          {
            description: '📜 Очистка /etc/hosts',
            command: `
              echo "127.0.0.1 localhost" > /etc/hosts &&
              echo "::1 localhost" >> /etc/hosts
            `,
          },
        ];

        for (const step of steps) {
          this.logger.log(`${step.description}...`);
          try {
            const output = await this.sshService.executeCommand(ssh, step.command);
            this.logger.log(`✅ ${step.description} выполнено:\n${output}`);
          } catch (err) {
            this.logger.error(`🚨 Ошибка при шаге: ${step.description}`, err.message);
          }
        }

        this.logger.log(`✅ Сервер ${server.ip} успешно сброшен.`);
        results.push({ ip: server.ip, status: 'success' });
      } catch (error) {
        this.logger.error(`🚨 Ошибка сброса на ${server.ip}: ${error.message}`);
        results.push({ ip: server.ip, status: 'error', message: error.message });
      }
    }

    const hasErrors = results.some((res) => res.status === 'error');

    return {
      status: hasErrors ? 'error' : 'reset_complete',
      results,
    };
  }
}
