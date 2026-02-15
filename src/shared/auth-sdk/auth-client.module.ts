import { Module, DynamicModule, Provider } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { AuthClientService } from './auth-client.service';
import { AUTH_CLIENT_OPTIONS } from './constants';

export interface AuthClientOptions {
  baseURL: string;
  apiKey: string;
  timeout?: number;
}

@Module({})
export class AuthClientModule {
  static register(options: AuthClientOptions): DynamicModule {
    return {
      module: AuthClientModule,
      imports: [
        HttpModule.register({
          baseURL: options.baseURL,
          timeout: options.timeout || 5000,
          headers: {
            'X-API-Key': options.apiKey,
          },
        }),
      ],
      providers: [
        {
          provide: AUTH_CLIENT_OPTIONS,
          useValue: options,
        },
        AuthClientService,
      ],
      exports: [AuthClientService],
      global: true,
    };
  }

  static registerAsync(options: {
    imports?: any[];
    useFactory: (...args: any[]) => Promise<AuthClientOptions> | AuthClientOptions;
    inject?: any[];
  }): DynamicModule {
    const asyncProviders: Provider[] = [
      {
        provide: AUTH_CLIENT_OPTIONS,
        useFactory: options.useFactory,
        inject: options.inject || [],
      },
      AuthClientService,
    ];

    return {
      module: AuthClientModule,
      imports: [
        ...(options.imports || []),
        HttpModule.registerAsync({
          useFactory: (opts: AuthClientOptions) => ({
            baseURL: opts.baseURL,
            timeout: opts.timeout || 5000,
            headers: {
              'X-API-Key': opts.apiKey,
            },
          }),
          inject: [AUTH_CLIENT_OPTIONS],
        }),
      ],
      providers: asyncProviders,
      exports: [AuthClientService],
      global: true,
    };
  }
}