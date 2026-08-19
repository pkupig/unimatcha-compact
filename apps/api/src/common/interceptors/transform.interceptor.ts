/* Interface outline: implementation bodies removed. */
import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface ApiResponse<T> {
@Injectable()
export class TransformInterceptor<T> {
  intercept(...);
  map((data) =>(...);
