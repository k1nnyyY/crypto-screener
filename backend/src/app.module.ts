import { Module } from '@nestjs/common';
import { SetupModule } from './modules/setup/setup.module';
import { ResetModule } from './modules/reset/reset.module';
import { SshModule } from './common/ssh/ssh.module';

@Module({
  imports: [
    SetupModule,
    ResetModule,
    SshModule,
  ],
})
export class AppModule {}
