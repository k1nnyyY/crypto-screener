import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class AppService {
  private readonly logger = new Logger(AppService.name);

  getStatus(): string {
    this.logger.log('API is running');
    return 'NestJS API is running 🚀';
  }
}
