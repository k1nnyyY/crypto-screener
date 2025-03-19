import { IsArray, IsInt, IsObject, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class ServerDto {
  @IsString() ip: string;
  @IsString() password: string;
}

class ShadowsocksDto {
  @IsString() password: string;
  @IsInt() port: number;
}

export class SetupDto {
  @IsInt() server_count: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ServerDto)
  servers: ServerDto[];

  @IsObject()
  @ValidateNested()
  @Type(() => ShadowsocksDto)
  shadowsocks: ShadowsocksDto;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  hosts?: string[];
}
