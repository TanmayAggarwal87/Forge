import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({
    origin: process.env.WEB_ORIGIN ?? 'https://forge-nine-sooty.vercel.app',
    credentials: true,
  });
  app.setGlobalPrefix('v1');
  await app.listen(process.env.PORT ?? 3000);

}
void bootstrap();
