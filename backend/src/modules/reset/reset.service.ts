import { Injectable, Logger, BadRequestException } from '@nestjs/common';
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
    this.logger.log('🔄 Инициализация сброса конфигурации серверов...');

    if (!data || !Array.isArray(data.servers)) {
      this.logger.error(`❌ Ошибка: некорректный формат запроса. Получено: ${JSON.stringify(data)}`);
      throw new BadRequestException('Некорректный формат запроса: servers должен быть массивом');
    }

    const { servers } = data;

    for (const server of servers) {
      try {
        const ssh = await this.sshService.connectToServer(server.ip, 'root', server.password);
        this.logger.log(`🛠 Подключение к серверу ${server.ip} для сброса...`);

        const shadowsocksCheck = await this.sshService.executeCommand(
          ssh,
          'systemctl list-units --type=service | grep -E "shadowsocks-libev|shadowsocks" || echo "not_installed"'
        );

        if (shadowsocksCheck.includes('not_installed')) {
          this.logger.warn(`⚠️ Shadowsocks не найден на сервере ${server.ip}, пропускаем остановку сервиса.`);
        } else {
          await this.sshService.executeCommand(
            ssh,
            'systemctl stop shadowsocks-libev-server@config || systemctl stop shadowsocks-libev || pkill -f ss-server || true'
          );
          this.logger.log(`✅ Shadowsocks остановлен на сервере ${server.ip}`);
        }

        await this.sshService.executeCommand(
          ssh,
          'rm -rf /etc/shadowsocks-libev/config.json /etc/shadowsocks-libev/config.json.enc /etc/shadowsocks-libev/.config_key'
        );
        this.logger.log(`🧹 Конфигурационные файлы Shadowsocks удалены на ${server.ip}`);

        await this.sshService.executeCommand(
          ssh,
          'iptables -F && iptables -t nat -F && iptables-save > /etc/iptables.rules'
        );
        this.logger.log(`🔥 iptables сброшен на сервере ${server.ip}`);

        await this.sshService.executeCommand(
          ssh,
          'sysctl -w net.ipv4.ip_forward=0 && sed -i \'/net.ipv4.ip_forward/d\' /etc/sysctl.conf && echo "net.ipv4.ip_forward=0" >> /etc/sysctl.conf && sysctl -p'
        );
        this.logger.log(`⛔ Отключён проброс трафика на сервере ${server.ip}`);

        await this.sshService.executeCommand(
          ssh,
          'if [ -f /etc/hosts.bak.ss ]; then mv /etc/hosts.bak.ss /etc/hosts; else sed -i \'/# Shadowsocks hosts entry/d\' /etc/hosts; fi'
        );
        this.logger.log(`📝 Файл /etc/hosts восстановлен на сервере ${server.ip}`);

        await this.sshService.executeCommand(
          ssh,
          'rm -rf /var/log/* /tmp/* /var/tmp/*'
        );
        this.logger.log(`🗑️ Логи и временные файлы удалены на сервере ${server.ip}`);

        await this.sshService.executeCommand(
          ssh,
          'history -c && echo > ~/.bash_history'
        );
        this.logger.log(`🔏 История команд очищена на сервере ${server.ip}`);

        if (!shadowsocksCheck.includes('not_installed')) {
          await this.sshService.executeCommand(
            ssh,
            'apt purge -y shadowsocks-libev || yum remove -y shadowsocks-libev || true'
          );
          this.logger.log(`📦 Shadowsocks удалён с ${server.ip}`);
        } else {
          this.logger.log(`📦 Shadowsocks не установлен на ${server.ip}, пропускаем удаление.`);
        }

        ssh.dispose();
        this.logger.log(`✅ Сервер ${server.ip} успешно сброшен.`);
      } catch (error) {
        this.logger.error(`🚨 Ошибка сброса на сервере ${server.ip}: ${error.message}`);
      }
    }

    return { status: 'reset_complete' };
  }
}
