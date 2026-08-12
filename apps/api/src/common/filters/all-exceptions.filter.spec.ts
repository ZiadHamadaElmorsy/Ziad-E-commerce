import { BadRequestException, NotFoundException } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import type { ArgumentsHost } from '@nestjs/common';
import { AllExceptionsFilter } from './all-exceptions.filter';

describe('AllExceptionsFilter', () => {
  let httpAdapter: { reply: jest.Mock };
  let httpAdapterHost: HttpAdapterHost;
  let host: ArgumentsHost;

  beforeEach(() => {
    httpAdapter = { reply: jest.fn() };
    httpAdapterHost = { httpAdapter } as unknown as HttpAdapterHost;
    host = {
      switchToHttp: () => ({
        getRequest: () => ({ method: 'GET', originalUrl: '/api/v1/test' }),
        getResponse: () => ({}),
      }),
    } as unknown as ArgumentsHost;
  });

  it('renders HttpExceptions with the project error envelope', () => {
    const filter = new AllExceptionsFilter(httpAdapterHost);
    const exception = new NotFoundException('The requested resource was not found.');

    filter.catch(exception, host);

    expect(httpAdapter.reply).toHaveBeenCalledWith(
      expect.anything(),
      {
        error: {
          code: 'RESOURCE_NOT_FOUND',
          message: 'The requested resource was not found.',
        },
      },
      404,
    );
  });

  it('renders validation errors with details and the VALIDATION_ERROR code', () => {
    const filter = new AllExceptionsFilter(httpAdapterHost);
    const exception = new BadRequestException(['name is required', 'price must be a number']);

    filter.catch(exception, host);

    expect(httpAdapter.reply).toHaveBeenCalledWith(
      expect.anything(),
      {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed.',
          details: ['name is required', 'price must be a number'],
        },
      },
      400,
    );
  });

  it('never leaks internal error details to the client', () => {
    const filter = new AllExceptionsFilter(httpAdapterHost);
    const internalError = new Error('database password=secret at /etc/app/config');

    filter.catch(internalError, host);

    const body = httpAdapter.reply.mock.calls[0][1];
    expect(body).toEqual({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An unexpected error occurred.',
      },
    });
    expect(JSON.stringify(body)).not.toContain('secret');
  });
});
