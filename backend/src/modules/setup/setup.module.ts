import { Module } from '@nestjs/common';
import { SetupService } from './setup.service';
import { SetupController } from './setup.controller';
import { SshModule } from '../../common/ssh/ssh.module'; 

@Module({
  imports: [SshModule],
  controllers: [SetupController],
  providers: [SetupService],
})
export class SetupModule {}
