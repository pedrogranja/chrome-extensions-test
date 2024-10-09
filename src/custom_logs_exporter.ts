/*
 * Copyright The OpenTelemetry Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import type {
    ReadableLogRecord,
    LogRecordExporter,
  } from '@opentelemetry/sdk-logs';
import type { OTLPExporterConfigBase } from '@opentelemetry/otlp-exporter-base';
import type { IExportLogsServiceResponse } from '@opentelemetry/otlp-transformer';
import { OTLPExporterBrowserBase } from '@opentelemetry/otlp-exporter-base';
import { JsonLogsSerializer } from '@opentelemetry/otlp-transformer';
import { OTLPExporterError } from '@opentelemetry/otlp-exporter-base';


import {
    createExportLogsServiceRequest,
  } from '@opentelemetry/otlp-transformer';
  
  /**
   * Collector Logs Exporter for Web
   */
  export class CustomLogExporter
    extends OTLPExporterBrowserBase<ReadableLogRecord, IExportLogsServiceResponse>
    implements LogRecordExporter
  {
    constructor(config: OTLPExporterConfigBase = {}) {
      super(
        {
          ...config,
        },
        JsonLogsSerializer,
        'application/json'
      );
    }

    send(
        items: ReadableLogRecord[],
        onSuccess: () => void,
        onError: (error: any) => void
    ): void {
        const request = createExportLogsServiceRequest(items, {
            useHex: true,
            useLongBits: false,
          });

        const body = JSON.stringify(request);
        console.log(body);
        this.sendWithFetch(
            body,
            this.url,
            {
            },
            this.timeoutMillis,
            () => {
                console.log('Success')
            },
            () => {
                console.log('Failure')
            }
        );
    }

/**
 * function to send metrics/spans using browser fetch
 *     used when navigator.sendBeacon and XMLHttpRequest are not available
 * @param body
 * @param url
 * @param headers
 * @param onSuccess
 * @param onError
 */
sendWithFetch(
    body: string,
    url: string,
    headers: Record<string, string>,
    exporterTimeout: number,
    onSuccess: () => void,
    onError: (error: OTLPExporterError) => void
  ): void {
    const controller = new AbortController();
    let cancelRetry: ((e: OTLPExporterError) => void) | undefined;
    const exporterTimer = setTimeout(() => {
      controller.abort();
      cancelRetry?.(new OTLPExporterError('Request Timeout'));
    }, exporterTimeout);

    const defaultHeaders = {
        'Content-Type': 'application/json',
    };
  
        const fetchWithRetry = (
        retries = 5
        ) => {
        return fetch(url, {
            method: 'POST',
            headers: {
            ...defaultHeaders,
            ...headers,
            },
            signal: controller.signal,
            body,
        }).then(
            response => {
            if (response.status >= 200 && response.status <= 299) {
                return;
            } 
            /*
            else if (
                response.status &&
                retries > 0
            ) {
                let retryTime: number;
                minDelay = DEFAULT_EXPORT_BACKOFF_MULTIPLIER * minDelay;
    
                // retry after interval specified in Retry-After header
                if (response.headers.has('Retry-After')) {
                retryTime = parseRetryAfterToMills(
                    response.headers.get('Retry-After')
                );
                } else {
                // exponential backoff with jitter
                retryTime = Math.round(
                    Math.random() * (DEFAULT_EXPORT_MAX_BACKOFF - minDelay) + minDelay
                );
                }
    
                return new Promise((resolve, reject) => {
                const retryTimer = setTimeout(() => {
                    cancelRetry = undefined;
                    fetchWithRetry(retries - 1, minDelay).then(resolve, reject);
                }, retryTime);
                cancelRetry = e => {
                    clearTimeout(retryTimer);
                    reject(e);
                };
                });
                
            } 
                */
            else {
                return Promise.reject(
                new OTLPExporterError(
                    `Failed to export with fetch: (${response.status} ${response.statusText})`,
                    response.status
                )
                );
            }
            },
            (e: Error) => {
            if (e.name === 'AbortError') {
                return Promise.reject(new OTLPExporterError('Request Timeout'));
            } else {
                return Promise.reject(
                new OTLPExporterError(`Request Fail: ${e.name} ${e.message}`)
                );
            }
            }
        );
        };
        fetchWithRetry()
        .then(
            () => onSuccess(),
            e => onError(e)
        )
        .finally(() => clearTimeout(exporterTimer));
    }

    getDefaultUrl(config: OTLPExporterConfigBase): any {
        return config.url;
    }
}