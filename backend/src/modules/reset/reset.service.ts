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

    for (const server of data.servers) {
      try {
        const ssh = await this.sshService.connectToServer(server.ip, 'root', server.password);
        this.logger.log(`🛠 Подключение к ${server.ip} для сброса...`);

        await this.sshService.executeCommand(ssh, `
          systemctl stop shadowsocks-libev || true
          rm -rf /etc/shadowsocks-libev/config.json /etc/shadowsocks-libev/config.json.enc
          apt purge -y shadowsocks-libev || yum remove -y shadowsocks-libev || true
          iptables -F && iptables -t nat -F && iptables-save > /etc/iptables.rules
          echo "net.ipv4.ip_forward=0" | tee -a /etc/sysctl.conf
          sysctl -w net.ipv4.ip_forward=0
          history -c && echo > ~/.bash_history
          rm -rf /var/log/* /tmp/* /var/tmp/*
        `);

        this.logger.log(`✅ Сервер ${server.ip} успешно сброшен.`);
      } catch (error) {
        this.logger.error(`🚨 Ошибка сброса на ${server.ip}: ${error.message}`);
      }
    }

    return { status: 'reset_complete' };
  }
}
