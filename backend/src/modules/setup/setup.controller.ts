import { Controller, Post, Body } from '@nestjs/common';
import { SetupService } from './setup.service';
import { SetupDto } from './setup.dto';

@Controller('setup')
export class SetupController {
  constructor(private readonly setupService: SetupService) {}

  @Post()
  async setup(@Body() setupDto: SetupDto) {
    return this.setupService.setupServers(setupDto);
  }
}
