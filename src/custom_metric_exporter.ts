// @ts-nocheck
import { ResourceMetrics } from '@opentelemetry/sdk-metrics';
import {
  OTLPExporterBrowserBase,
  OTLPExporterConfigBase,
  appendResourcePathToUrl, 
  appendRootPathToUrlIfNeeded
} from '@opentelemetry/otlp-exporter-base';

import { OTLPMetricExporterBase, OTLPMetricExporterOptions } from '@opentelemetry/exporter-metrics-otlp-http';

import {
  IExportMetricsServiceResponse,
  JsonMetricsSerializer,
  createExportMetricsServiceRequest
} from '@opentelemetry/otlp-transformer';
import { CustomExporter } from './custom_exporter';

import { getEnv, baggageUtils } from '@opentelemetry/core';
import { OTLPExporterError } from '@opentelemetry/otlp-exporter-base';

const DEFAULT_COLLECTOR_RESOURCE_PATH = 'v1/metrics';

class OTLPExporterBrowserProxy extends OTLPExporterBrowserBase<
  ResourceMetrics,
  IExportMetricsServiceResponse
> {

  constructor(config?: OTLPMetricExporterOptions & OTLPExporterConfigBase) {
    super(
      config,
      JsonMetricsSerializer,
      'application/json'
    );
  }
  
  send(
    items: ResourceMetrics[],
    onSuccess: () => void,
    onError: (error: any) => void
    ): void {
        const request = createExportMetricsServiceRequest(items, {
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
    if (typeof config.url === 'string') {
    return config.url;
    }

    const env = getEnv();
    if (env.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT.length > 0) {
    return appendRootPathToUrlIfNeeded(
        env.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT
    );
    }

    if (env.OTEL_EXPORTER_OTLP_ENDPOINT.length > 0) {
    return appendResourcePathToUrl(
        env.OTEL_EXPORTER_OTLP_ENDPOINT,
        DEFAULT_COLLECTOR_RESOURCE_PATH
    );
    }
    }
}

/**
 * Collector Metric Exporter for Web
 */
export class OTLPMetricExporter extends OTLPMetricExporterBase<OTLPExporterBrowserProxy> {
  constructor(config?: OTLPExporterConfigBase & OTLPMetricExporterOptions) {
    super(new OTLPExporterBrowserProxy(config), config);
  }
}