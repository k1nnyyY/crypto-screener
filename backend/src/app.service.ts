import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class AppService {
  private readonly logger = new Logger(AppService.name);

  processSetup(data: any) {
    this.logger.log(`Processing setup request`);
  }

  reset() {
    this.logger.log('Resetting configuration');
  }
}
