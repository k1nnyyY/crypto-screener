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

  private async reconnect(serverIp: string, user: string, password: string): Promise<NodeSSH> {
    let attempt = 0;
    while (attempt < 5) {
      try {
        return await this.sshService.connectToServer(serverIp, user, password);
      } catch (error) {
        this.logger.warn(`Попытка ${attempt + 1}/5 подключения к ${serverIp} не удалась...`);
        attempt++;
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    }
    throw new Error(`Не удалось подключиться к ${serverIp}`);
  }

  async setupServers(data: SetupData): Promise<any> {
    const { servers, shadowsocks, hosts } = data;

    for (const [index, server] of servers.entries()) {
      const role = index === servers.length - 1 ? 'final' : 'intermediate';
      const nextServerIp = servers[index + 1]?.ip;

      const ssh = await this.reconnect(server.ip, 'root', server.password);
      this.logger.log(`🛠 Настройка сервера ${server.ip}. Роль: ${role}`);

      await this.sshService.executeCommand(ssh, 
        `echo "net.ipv4.ip_forward=1" | tee -a /etc/sysctl.conf
        sysctl -w net.ipv4.ip_forward=1
        iptables -I FORWARD -i eth0 -o eth0 -j ACCEPT
        iptables -I INPUT -p tcp --dport ${shadowsocks.port} -j ACCEPT
        iptables -I INPUT -p udp --dport ${shadowsocks.port} -j ACCEPT
        iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE
        iptables-save > /etc/iptables.rules`
      );

      await this.sshService.executeCommand(ssh, 
        `apt update && apt install -y shadowsocks-libev
        mkdir -p /etc/shadowsocks-libev
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
        systemctl restart shadowsocks-libev`
      );
if (hosts.length > 0) {
  const hostEntries = hosts.map((host) => `127.0.0.1 ${host}`).join("\n");
  await this.sshService.executeCommand(
    ssh,
    `echo -e "${hostEntries}" >> /etc/hosts`
  );
  this.logger.log(`✅ Хосты добавлены в /etc/hosts на сервере ${server.ip}`);
}

      if (role === 'intermediate' && nextServerIp) {
        await this.sshService.executeCommand(ssh, 
          `apt update && apt install -y docker-compose
          
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
          docker-compose up -d`
        );
      }

      this.logger.log(`✅ Сервер ${server.ip} настроен.`);
    }

    this.logger.log('🛠 Настройка последних этапов...');

    for (const [index, server] of servers.entries()) {
      const role = index === servers.length - 1 ? 'final' : 'intermediate';
      const nextServerIp = servers[index + 1]?.ip;
      const ssh = await this.reconnect(server.ip, 'root', server.password);
      this.logger.log(`🚀 Выполнение финальных команд для сервера ${server.ip} (Роль: ${role})`);

      if (role === 'intermediate' && nextServerIp) {
        await this.sshService.executeCommand(ssh, 
          `echo 1 > /proc/sys/net/ipv4/ip_forward
    sysctl -w net.ipv4.ip_forward=1
    echo "net.ipv4.ip_forward = 1" >> /etc/sysctl.conf
    sysctl -p
    cat /proc/sys/net/ipv4/ip_forward
    sudo apt install iptables
    sudo iptables -t nat -F
    sudo iptables -t nat -X
    sudo iptables -F
    sudo iptables -X
    
    sudo iptables -t nat -A PREROUTING -p tcp --dport ${shadowsocks.port} -j DNAT --to-destination ${nextServerIp}:${shadowsocks.port}
    sudo iptables -t nat -A PREROUTING -p udp --dport ${shadowsocks.port} -j DNAT --to-destination ${nextServerIp}:${shadowsocks.port}
    sudo iptables -t nat -A POSTROUTING -o ens3 -j MASQUERADE
    sudo iptables -t nat -L -n -v
    
    echo "Настройка промежуточного сервера ${server.ip} завершена."`
        );
    }
     
if (role === 'final') {
  await this.sshService.executeCommand(ssh, 
    `    sudo apt install iptables
sudo iptables -F
sudo iptables -X
sudo iptables -t nat -F
sudo iptables -t nat -X
sudo iptables -A INPUT -p tcp --dport ${shadowsocks.port} -j ACCEPT
sudo iptables -A INPUT -p udp --dport ${shadowsocks.port} -j ACCEPT
sudo iptables -A OUTPUT -j ACCEPT

apt install -y iptables-persistent
netfilter-persistent save

systemctl restart shadowsocks-libev

echo "Настройка финального сервера ${server.ip} завершена."`
  );
}
    }

    this.logger.log('✅ Все серверы настроены.');

    process.stdin.resume();

    return { status: 'success', servers };
  }
}
