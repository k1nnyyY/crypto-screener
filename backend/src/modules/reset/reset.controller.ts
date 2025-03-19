import { Controller, Post, Body, BadRequestException } from '@nestjs/common';
import { ResetService } from './reset.service';

@Controller('/reset')
export class ResetController {
  constructor(private readonly resetService: ResetService) {}

  @Post()
  async reset(@Body() body: any) {
    console.log('📥 Получен запрос на сброс:', body);

    if (Array.isArray(body)) {
      body = { servers: body };
    }
    
    if (!body || !Array.isArray(body.servers)) {
      throw new BadRequestException('Некорректный формат запроса: ожидается объект { "servers": [...] }');
    }

    return this.resetService.resetServers(body);
  }
}
