import { Module } from '@nestjs/common';
import { ResetService } from './reset.service';
import { ResetController } from './reset.controller';
import { SshModule } from '../../common/ssh/ssh.module';

@Module({
  imports: [SshModule],
  controllers: [ResetController],
  providers: [ResetService],
})
export class ResetModule {}
