(() => {
    const vscode = acquireVsCodeApi();
    const target = document.getElementById("settings-target");

    if (!(target instanceof HTMLSelectElement)) {
        return;
    }

    target.addEventListener("change", () => {
        if (target.value === "user" || target.value === "workspace") {
            vscode.postMessage({type: "selectTarget", target: target.value});
        }
    });

    const table = document.querySelector(".settings-table-container");

    if (!(table instanceof HTMLElement)) {
        return;
    }

    const SCROLL_SMOOTHING_MS = 80;
    const HORIZONTAL_WHEEL_SPEED = 0.75;
    const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");
    const page = document.scrollingElement ?? document.documentElement;
    const horizontal = createScroller(table, "scrollLeft", "scrollWidth", "clientWidth");
    const vertical = createScroller(page, "scrollTop", "scrollHeight", "clientHeight");

    function createScroller(element, position, contentSize, viewportSize) {
        let frame;
        let destination = element[position];
        let previousTime;

        const clamp = value => Math.max(0, Math.min(Math.max(0, element[contentSize] - element[viewportSize]), value));

        function stop() {
            if (frame !== undefined) {
                cancelAnimationFrame(frame);
            }

            frame = undefined;
            previousTime = undefined;
            destination = element[position];
        }

        function animate(time) {
            destination = clamp(destination);
            const current = element[position];
            const distance = destination - current;

            if (reduceMotion.matches || Math.abs(distance) < 0.5) {
                element[position] = destination;
                stop();
                return;
            }

            const elapsed = previousTime === undefined ? 16 : Math.min(time - previousTime, 64);
            previousTime = time;
            element[position] = current + distance * (1 - Math.exp(-elapsed / SCROLL_SMOOTHING_MS));

            if (element[position] === current) {
                element[position] = destination;
                stop();
                return;
            }

            frame = requestAnimationFrame(animate);
        }

        return {
            stop,
            move(delta) {
                const current = element[position];
                const base =
                    frame === undefined || Math.sign(delta) !== Math.sign(destination - current)
                        ? current
                        : destination;

                const next = clamp(base + delta);

                if (next === current) {
                    stop();
                    return false;
                }

                destination = next;

                if (reduceMotion.matches) {
                    element[position] = destination;
                    stop();
                } else if (frame === undefined) {
                    frame = requestAnimationFrame(animate);
                }

                return true;
            }
        };
    }

    function stopScrolling() {
        horizontal.stop();
        vertical.stop();
    }

    document.addEventListener("pointerdown", stopScrolling, {capture: true});
    document.addEventListener("keydown", stopScrolling, {capture: true});

    document.addEventListener(
        "wheel",
        event => {
            if (!event.composedPath().includes(table)) {
                stopScrolling();
            }
        },
        {capture: true, passive: true}
    );

    table.addEventListener(
        "wheel",
        event => {
            const mode = event.deltaMode;

            if (
                event.defaultPrevented ||
                !event.cancelable ||
                event.metaKey ||
                event.altKey ||
                event.shiftKey ||
                event.deltaX !== 0 ||
                event.deltaY === 0
            ) {
                stopScrolling();
                return;
            }

            let delta = event.deltaY;

            if (mode === WheelEvent.DOM_DELTA_LINE) {
                const lineHeight = Number.parseFloat(getComputedStyle(table).lineHeight);
                delta *= Number.isFinite(lineHeight) ? lineHeight : 16;
            } else if (mode === WheelEvent.DOM_DELTA_PAGE) {
                delta *= event.ctrlKey ? page.clientHeight : table.clientWidth;
            }

            if (event.ctrlKey) {
                horizontal.stop();
                vertical.move(delta);
                event.preventDefault();
                return;
            }

            vertical.stop();

            if (horizontal.move(delta * HORIZONTAL_WHEEL_SPEED)) {
                event.preventDefault();
            }
        },
        {passive: false}
    );
})();
