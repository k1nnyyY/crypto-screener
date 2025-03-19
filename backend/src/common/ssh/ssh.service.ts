import { Injectable, Logger } from '@nestjs/common';
import { NodeSSH } from 'node-ssh';
import { exec } from 'child_process';

@Injectable()
export class SshService {
  private readonly logger = new Logger(SshService.name);
  private ssh: NodeSSH;

  async connectToServer(ip: string, user: string, password: string): Promise<NodeSSH> {
    const ssh = new NodeSSH();
    try {
      await ssh.connect({ host: ip, username: user, password });
      this.logger.log(`✅ Подключение к ${ip} успешно.`);
      return ssh;
    } catch (err) {
      this.logger.error(`❌ Ошибка подключения к ${ip}: ${err.message}`);
      throw new Error(`Не удалось подключиться к ${ip}`);
    }
  }

  async executeCommand(ssh: NodeSSH, command: string): Promise<string> {
    const result = await ssh.execCommand(command);
    if (result.code !== 0) {
      this.logger.error(`❌ Команда "${command}" завершилась с ошибкой: ${result.stderr}`);
      throw new Error(result.stderr);
    }
    return result.stdout;
  }

  async pingServer(ip: string): Promise<boolean> {
    return new Promise((resolve) => {
      exec(`ping -c 1 -W 2 ${ip}`, (error, stdout, stderr) => {
        if (error || stderr) {
          this.logger.error(`❌ Ping не прошёл для ${ip}`);
          resolve(false);
        } else {
          this.logger.log(`✅ Ping для ${ip} успешен.`);
          resolve(true);
        }
      });
    });
  }
}
