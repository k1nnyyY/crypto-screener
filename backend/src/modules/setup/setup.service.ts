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
  encryptConfig?: boolean;
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
  private async reconnect(
    serverIp: string,
    user: string,
    password: string,
    maxAttempts = 30,
    interval = 2000,
  ): Promise<NodeSSH> {
    let attempt = 0;
    let sshConnection: NodeSSH;
    while (attempt < maxAttempts) {
      try {
        sshConnection = await this.sshService.connectToServer(serverIp, user, password);
        this.logger.log(`Подключение к ${serverIp} установлено с попытки ${attempt + 1}.`);
        return sshConnection;
      } catch (error) {
        this.logger.warn(
          `Попытка подключения к ${serverIp} (${attempt + 1}/${maxAttempts}) не удалась. Повтор через ${interval / 1000} сек...`
        );
        attempt++;
        await new Promise((resolve) => setTimeout(resolve, interval));
      }
    }
    throw new Error(`Не удалось переподключиться к ${serverIp} после ${maxAttempts} попыток.`);
  }
  private async safeReboot(ssh: NodeSSH, serverIp: string): Promise<void> {
    this.logger.log(`Выполнение безопасной перезагрузки сервера ${serverIp}...`);
    try {
      await this.sshService.executeCommand(ssh, 'reboot');
    } catch (error) {
      this.logger.warn(`Ошибка при выполнении перезагрузки на ${serverIp}: ${(error.message || error).toString()}. Игнорирую.`);
    } finally {
      try {
        ssh.dispose();
      } catch (disposeError) {
        this.logger.warn(`Ошибка при закрытии SSH-соединения с ${serverIp}: ${(disposeError.message || disposeError).toString()}`);
      }
    }
  }
  
  
  async setupServers(data: SetupData): Promise<any> {
    const { servers, shadowsocks, hosts } = data;

    for (let i = 0; i < servers.length; i++) {
      const server = servers[i];
      const role = i === servers.length - 1 ? 'final' : 'intermediate';

      const isReachable = await this.sshService.pingServer(server.ip);
      if (!isReachable) {
        this.logger.error(`🚨 Сервер ${server.ip} не отвечает на ping, пропускаем.`);
        continue;
      }

      const ssh = await this.sshService.connectToServer(server.ip, 'root', server.password);
      this.logger.log(`🛠 Подключились к ${server.ip}. Роль: ${role}`);

      const osVersion = await this.sshService.executeCommand(ssh, 'lsb_release -rs');
      this.logger.log(`Версия ОС на ${server.ip}: ${osVersion.trim()}`);

      if (role === 'intermediate') {
        // =====================
        // Настройка промежуточного сервера
        // =====================
        this.logger.log(`Настройка промежуточного сервера ${server.ip}...`);
        await this.sshService.executeCommand(ssh, 'wget http://fjedi.com/init_server.sh');
        await this.sshService.executeCommand(ssh, 'chmod +x init_server.sh');
        await this.sshService.executeCommand(ssh, './init_server.sh');
        await this.sshService.executeCommand(ssh, 'apt install -y docker-compose');

        const nextServerIp = servers[i + 1]?.ip;
        const composeContent = `version: '3.0'
services:
  api:
    image: nadoo/glider
    container_name: proxy
    ports:
      - "1080:1080"
      - "8388:8388"
    restart: unless-stopped
    logging:
      driver: 'json-file'
      options:
        max-size: '800k'
        max-file: '10'
    command: -verbose -listen ss://AEAD_AES_256_GCM:${shadowsocks.password}@api:8388 -forward ss://AEAD_AES_256_GCM:${shadowsocks.password}@${nextServerIp}:8388`;

        await this.sshService.executeCommand(ssh, `echo "${composeContent}" > docker-compose.yml`);

        await this.sshService.executeCommand(ssh, 'docker-compose up -d');

        await this.sshService.executeCommand(ssh, 'ufw disable || true');

      } else if (role === 'final') {
        // =====================
        // Настройка конечного сервера
        // =====================
        this.logger.log(`Настройка конечного сервера ${server.ip}...`);
        await this.sshService.executeCommand(ssh, 'apt update && apt upgrade -y');
        await this.sshService.executeCommand(ssh, 'apt install -y snapd');

        const sshFinal = await this.reconnect(server.ip, 'root', server.password, 30, 2000);

        await this.sshService.executeCommand(sshFinal, 'snap install shadowsocks-libev');

        await this.sshService.executeCommand(
          sshFinal,
          'mkdir -p /var/snap/shadowsocks-libev/common/etc/shadowsocks-libev'
        );
        const configJson = `{
  "server": ["::0", "0.0.0.0"],
  "mode": "tcp_and_udp",
  "server_port": 8388,
  "local_port": 1080,
  "password": "${shadowsocks.password}",
  "timeout": 60,
  "fast_open": true,
  "reuse_port": true,
  "no_delay": true,
  "method": "aes-256-gcm"
}`;
        await this.sshService.executeCommand(
          sshFinal,
          `echo '${configJson}' > /var/snap/shadowsocks-libev/common/etc/shadowsocks-libev/config.json`
        );

        if (shadowsocks.encryptConfig) {
          this.logger.log('Шифрование конфигурационного файла...');
          const encKey = await this.sshService.executeCommand(sshFinal, 'openssl rand -hex 16');
          await this.sshService.executeCommand(
            sshFinal,
            `openssl enc -aes-256-cbc -salt -in /var/snap/shadowsocks-libev/common/etc/shadowsocks-libev/config.json -out /var/snap/shadowsocks-libev/common/etc/shadowsocks-libev/config.json.enc -k "${encKey.trim()}"`
          );
          await this.sshService.executeCommand(sshFinal, 'shred -u /var/snap/shadowsocks-libev/common/etc/shadowsocks-libev/config.json');
          await this.sshService.executeCommand(
            sshFinal,
            'echo "' + encKey.trim() + '" > /var/snap/shadowsocks-libev/common/etc/shadowsocks-libev/.config_key && chmod 600 /var/snap/shadowsocks-libev/common/etc/shadowsocks-libev/.config_key'
          );
          this.logger.log('Конфигурация зашифрована.');
        }

        const serviceContent = `[Unit]
Description=Shadowsocks-Libev Custom Server Service for %I
Documentation=man:ss-server(1)
After=network-online.target

[Service]
Type=simple
ExecStart=/usr/bin/snap run shadowsocks-libev.ss-server -c /var/snap/shadowsocks-libev/common/etc/shadowsocks-libev/%i.json

[Install]
WantedBy=multi-user.target`;
        await this.sshService.executeCommand(
          sshFinal,
          `echo '${serviceContent}' > /etc/systemd/system/shadowsocks-libev-server@.service`
        );

        await this.sshService.executeCommand(sshFinal, 'systemctl enable --now shadowsocks-libev-server@config');
        const status = await this.sshService.executeCommand(sshFinal, 'systemctl status shadowsocks-libev-server@config');
        this.logger.log(`Статус сервиса на ${server.ip}: ${status}`);

        await this.sshService.executeCommand(sshFinal, 'iptables -I INPUT -p tcp --dport 8388 -j ACCEPT');
        await this.sshService.executeCommand(sshFinal, 'iptables -I INPUT -p udp --dport 8388 -j ACCEPT');

        const hostsEntry = `13.225.164.218 fapi.binance.com
13.227.61.59 fapi.binance.com
143.204.127.42 fapi.binance.com
13.35.51.41 fapi.binance.com
99.84.58.138 fapi.binance.com
18.65.193.131 fapi.binance.com
18.65.176.132 fapi.binance.com
99.84.140.147 fapi.binance.com
13.225.173.96 fapi.binance.com
54.240.188.143 fapi.binance.com
13.35.55.41 fapi.binance.com
18.65.207.131 fapi.binance.com
143.204.79.125 fapi.binance.com
65.9.40.137 fapi.binance.com
99.84.137.147 fapi.binance.com
18.65.212.131 fapi.binance.com`;
        await this.sshService.executeCommand(sshFinal, `echo '${hostsEntry}' >> /etc/hosts`);
        await this.sshService.executeCommand(sshFinal, `echo '${hostsEntry.replace(/fapi/g, 'api')}' >> /etc/hosts`);

        await this.sshService.executeCommand(sshFinal, 'ufw disable || true');

        sshFinal.dispose();
      }

      await this.sshService.executeCommand(ssh, 'history -c && echo > ~/.bash_history');
      await this.sshService.executeCommand(ssh, 'rm -rf /var/log/* /tmp/*');

      const ssCheck = await this.sshService.executeCommand(ssh, 'ss -tulnp | grep 8388 || echo "not_running"');
      if (ssCheck.includes('not_running')) {
        this.logger.error(`❌ Shadowsocks не запущен на ${server.ip}, пробуем перезапуск...`);
        await this.sshService.executeCommand(ssh, 'systemctl restart shadowsocks-libev || true');
      } else {
        this.logger.log(`✅ Shadowsocks работает на ${server.ip}`);
      }

      if (hosts && hosts.length > 0) {
        this.logger.log(`📝 Добавление пользовательских записей в /etc/hosts на ${server.ip}`);
        await this.sshService.executeCommand(ssh, 'cp -n /etc/hosts /etc/hosts.bak.ss || true');
        for (const entry of hosts) {
          const [hostname, ip] = entry.split(':');
          await this.sshService.executeCommand(ssh, `echo '${ip} ${hostname} # Shadowsocks hosts entry' >> /etc/hosts`);
        }
      }

      ssh.dispose();
    }

    const response = {
      status: 'success',
      servers: servers.map((srv, idx) => ({
        ip: srv.ip,
        role: idx === servers.length - 1 ? 'final' : 'intermediate',
        ...(idx === servers.length - 1
          ? { shadowsocks: { ip: srv.ip, port: shadowsocks.port, password: shadowsocks.password } }
          : {}),
      })),
    };

    return response;
  }
}
