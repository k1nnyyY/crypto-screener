import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors();

  app.use((req, res, next) => {
    console.log(`Request... [${req.method}] ${req.url}`);
    next();
  });

  await app.listen(3000);
  console.log('NestJS API запущен на http://localhost:3000');
}
bootstrap();
