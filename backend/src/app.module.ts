import { Module } from '@nestjs/common';
import { SetupController } from './controllers/setup.controller';
import { SetupService } from './services/setup.service';

@Module({
  controllers: [SetupController],
  providers: [SetupService],
})
export class AppModule {}
