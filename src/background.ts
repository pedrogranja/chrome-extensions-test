// Background process in service worker
import { trace, context, SpanStatusCode, SpanKind } from '@opentelemetry/api';
import { WebTracerProvider } from '@opentelemetry/sdk-trace-web';
import { ConsoleSpanExporter, SimpleSpanProcessor, AlwaysOnSampler } from '@opentelemetry/sdk-trace-base';
import { Resource } from '@opentelemetry/resources';
import { SEMRESATTRS_SERVICE_NAME, SEMRESATTRS_SERVICE_NAMESPACE } from '@opentelemetry/semantic-conventions';
import { W3CTraceContextPropagator } from '@opentelemetry/core';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { FetchInstrumentation } from '@opentelemetry/instrumentation-fetch';
import { CustomExporter } from './custom_exporter';
import { type Context, propagation } from '@opentelemetry/api';

const NAME = 'chrome-webextension-test-background-new';

const provider = new WebTracerProvider(
  {
    resource: new Resource({
      [SEMRESATTRS_SERVICE_NAME]: NAME,
      [SEMRESATTRS_SERVICE_NAMESPACE] : 'new_test'
    }),
    sampler: new AlwaysOnSampler()
 });

provider.addSpanProcessor(new SimpleSpanProcessor(new CustomExporter({
  // optional - default url is http://localhost:4318/v1/traces
  url: 'http://localhost:4318/v1/traces',
  // optional - collection of custom headers to be sent with each request, empty by default
  headers: {
    "Content-Type": "application/json",
  },
})));

provider.addSpanProcessor(new SimpleSpanProcessor(new ConsoleSpanExporter()));

provider.register({
  propagator: new W3CTraceContextPropagator()
});

registerInstrumentations({
  instrumentations: [new FetchInstrumentation()]
});


chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.message === "button_clicked") {

    interface Carrier {
      traceparent?: string;
      tracestate?: string;
    }
    
    // Assume "input" is an object with 'traceparent' & 'tracestate' keys.
    const input: Carrier = {};
    input.traceparent = request.traceparent;
    
    // Extracts the 'traceparent' and 'tracestate' data into a context object.
    //
    // You can then treat this context as the active context for your
    // traces.
    let activeContext: Context = propagation.extract(context.active(), input);

    console.log("Starting OTEL trace");
    const span = provider.getTracer('background').startSpan('click', {
      kind: SpanKind.SERVER,
    }, activeContext);
    
    context.with(trace.setSpan(context.active(), span), () => {
        // push log
        span.setStatus({ code: SpanStatusCode.OK });
        console.log("Finishing OTEL trace");
        span.end();
    });

    const span2 = trace.getTracer('background').startSpan('background process');
    context.with(trace.setSpan(context.active(), span2), () => {
        // push log
        span2.setStatus({ code: SpanStatusCode.OK });
        console.log("Finishing OTEL trace 2");
        span2.end();
    });

    sendResponse();
  }
});
