import { Controller, Post, Body } from '@nestjs/common';
import { SetupService } from '../services/setup.service';

@Controller('setup')
export class SetupController {
  constructor(private readonly setupService: SetupService) {}

  @Post()
  async handleSetup(@Body() data) {
    return this.setupService.setupServers(data);
  }
}
