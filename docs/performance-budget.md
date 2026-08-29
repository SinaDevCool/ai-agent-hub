# Performance budget

CI measures production build artifacts and fails above 200 KB total gzipped JavaScript, 70 KB for the largest gzipped JavaScript chunk, or 25 KB total gzipped CSS. These limits prevent silent bundle regressions; they are not substitutes for field or lab Core Web Vitals.

Before production, capture a cold-load staging trace on representative desktop and mobile throttling, record LCP, INP, CLS, FCP, TBT, Speed Index, document latency, render-blocking resources, and network dependency findings, and attach the trace to release evidence. The Chrome DevTools MCP integration is currently unavailable, so measured results remain pending.
