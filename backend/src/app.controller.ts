import { Controller, Post, Body } from '@nestjs/common';
import { AppService } from './app.service';

class SetupDto {
  server_count: number;
  servers: any[];
  shadowsocks: any;
  hosts: any[];
}

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Post('setup')
  handleSetup(@Body() data: SetupDto) {
    return { status: 'ok' };
  }

  @Post('reset')
  handleReset() {
    return { status: 'reset' };
  }
}