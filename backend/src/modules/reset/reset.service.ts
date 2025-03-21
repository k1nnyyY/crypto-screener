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
            command: 'rm -rf /etc/shadowsocks-libev/config.json /etc/shadowsocks-libev/config.json.enc',
          },
          {
            description: '🧼 Удаление Shadowsocks-пакета',
            command: 'apt purge -y shadowsocks-libev || yum remove -y shadowsocks-libev || true',
          },
          {
            description: '🔥 Очистка iptables',
            command: 'iptables -F && iptables -t nat -F && iptables-save > /etc/iptables.rules',
          },
          {
            description: '🚫 Отключение IP Forwarding',
            command: 'echo "net.ipv4.ip_forward=0" | tee -a /etc/sysctl.conf && sysctl -w net.ipv4.ip_forward=0',
          },
          {
            description: '📜 Очистка истории команд',
            command: 'history -c && echo > ~/.bash_history',
          },
          {
            description: '🧽 Очистка логов и временных файлов',
            command: 'rm -rf /var/log/* /tmp/* /var/tmp/*',
          },
        ];
        
        for (const step of steps) {
          this.logger.log(`${step.description}...`);
          try {
            const output = await this.sshService.executeCommand(ssh, step.command);
            this.logger.log(`✅ ${step.description} выполнено:\n${output}`);
          } catch (err) {
            this.logger.error(`🚨 Ошибка при выполнении шага: ${step.description}`, err.message);
          }
        }
        
        this.logger.log(`🛠 Происходит очистка хоста ${server.ip}...`);
        await this.sshService.executeCommand(ssh, `
          # Очистка /etc/hosts, оставляя только базовые записи
          echo "127.0.0.1 localhost" > /etc/hosts
          echo "::1 localhost" >> /etc/hosts
        `);

        this.logger.log(`✅ Сервер ${server.ip} успешно сброшен.`);
        results.push({ ip: server.ip, status: 'success' });
      } catch (error) {
        this.logger.error(`🚨 Ошибка сброса на ${server.ip}: ${error.message}`);
        results.push({ ip: server.ip, status: 'error', message: error.message });
      }
    }

    // Проверяем, есть ли ошибки
    const hasErrors = results.some((res) => res.status === 'error');

    return {
      status: hasErrors ? 'error' : 'reset_complete',
      results,
    };
  }
}
