import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class SetupService {
  private readonly logger = new Logger(SetupService.name);

  async setupServers(data) {
    this.logger.log(`Запрос на настройку серверов получен`);
    return { status: 'ok' };
  }
}