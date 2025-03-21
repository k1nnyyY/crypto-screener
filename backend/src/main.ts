import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors();
  app.setGlobalPrefix('api');

  app.use((req, res, next) => {
    console.log(`Request... [${req.method}] ${req.url}`);
    next();
  });

  await app.listen(process.env.PORT || 5001);
}
bootstrap();
