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

    const draftStatus = document.getElementById("draft-status");
    const discard = document.getElementById("discard-draft");

    window.addEventListener("message", event => {
        const message = event.data;

        if (
            message === null ||
            typeof message !== "object" ||
            (message.type !== "draftState" && message.type !== "fieldReverted") ||
            message.target !== target.value ||
            typeof message.isDirty !== "boolean" ||
            !isControlState(message.controls)
        ) {
            return;
        }

        if (message.type === "fieldReverted" && !applyRevertedField(message)) {
            return;
        }

        applyControlState(message.controls);

        if (draftStatus instanceof HTMLElement) {
            draftStatus.textContent = message.isDirty
                ? "Unapplied changes in this scope."
                : "No unapplied changes in this scope.";
        }

        if (discard instanceof HTMLButtonElement) {
            discard.disabled = !message.isDirty;
        }
    });

    function isFieldState(state) {
        return (
            state !== null &&
            typeof state === "object" &&
            typeof state.canRevert === "boolean" &&
            typeof state.canRemove === "boolean"
        );
    }

    function isControlState(state) {
        if (state === null || typeof state !== "object") {
            return false;
        }

        return ["class", "import", "catch", "throws"].every(context => {
            const fields = state[context];

            return (
                fields !== null &&
                typeof fields === "object" &&
                isFieldState(fields.source) &&
                isFieldState(fields.color)
            );
        });
    }

    function applyControlState(state) {
        for (const row of document.querySelectorAll("tbody tr[data-context]")) {
            const context = row.dataset.context;

            if (!["class", "import", "catch", "throws"].includes(context)) {
                continue;
            }

            for (const button of row.querySelectorAll("[data-revert-field]")) {
                if (!(button instanceof HTMLButtonElement)) {
                    continue;
                }

                const field = button.dataset.revertField;

                if (field === "source" || field === "color") {
                    button.disabled = !state[context][field].canRevert;
                }
            }

            for (const button of row.querySelectorAll("[data-reset-field]")) {
                if (!(button instanceof HTMLButtonElement)) {
                    continue;
                }

                const field = button.dataset.resetField;

                if (field === "source" || field === "color") {
                    button.disabled = !state[context][field].canRemove;
                }
            }
        }
    }

    function formatScopedValue(value) {
        if (value === undefined) {
            return "Not set in this scope";
        }

        if (typeof value === "string") {
            return JSON.stringify(value);
        }

        if (value === null || typeof value === "boolean" || typeof value === "number") {
            return String(value);
        }

        return "Unsupported value";
    }

    function applyRevertedField(message) {
        if (
            !["class", "import", "catch", "throws"].includes(message.context) ||
            (message.field !== "source" && message.field !== "color")
        ) {
            return false;
        }

        const control = document.getElementById(`${message.field}-${message.context}`);

        if (message.field === "color") {
            if (!(control instanceof HTMLInputElement)) {
                return false;
            }

            control.value = typeof message.value === "string" ? message.value : "";
        } else {
            if (!(control instanceof HTMLSelectElement)) {
                return false;
            }

            const known =
                message.value === undefined ||
                message.value === "custom" ||
                message.value === "native" ||
                (message.context !== "class" && message.value === "inherit");
            let stored = control.querySelector('option[value="stored"]');

            if (known) {
                stored?.remove();
                control.value = message.value === undefined ? "" : message.value;
            } else {
                if (stored === null) {
                    stored = document.createElement("option");
                    stored.value = "stored";
                    stored.disabled = true;
                    stored.textContent = "Stored value (see below)";
                    control.prepend(stored);
                }

                control.value = "stored";
            }
        }

        const display = control.closest("tr")?.querySelector(`[data-value-field="${message.field}"] code`);

        if (display instanceof HTMLElement) {
            const text = formatScopedValue(message.value);

            display.textContent = text;
            display.parentElement?.setAttribute("title", text);
        }

        return true;
    }

    if (discard instanceof HTMLButtonElement) {
        discard.addEventListener("click", () => {
            if (!discard.disabled && (target.value === "user" || target.value === "workspace")) {
                vscode.postMessage({type: "discard", target: target.value});
            }
        });
    }

    for (const row of document.querySelectorAll("tbody tr[data-context]")) {
        const context = row.dataset.context;

        if (!["class", "import", "catch", "throws"].includes(context)) {
            continue;
        }

        const source = row.querySelector('[data-setting="source"]');
        const color = row.querySelector('[data-setting="color"]');

        function sendChange(message) {
            if (target.value === "user" || target.value === "workspace") {
                vscode.postMessage({...message, target: target.value, context});
            }
        }

        function showValue(field, value) {
            const display = row.querySelector(`[data-value-field="${field}"] code`);

            if (display instanceof HTMLElement) {
                const text = formatScopedValue(value);

                display.textContent = text;
                display.parentElement?.setAttribute("title", text);
            }

            if (field === "source") {
                row.querySelector('option[value="stored"]')?.remove();
            }
        }

        if (source instanceof HTMLSelectElement) {
            source.addEventListener("change", () => {
                if (source.value === "") {
                    showValue("source", undefined);
                    sendChange({type: "resetField", field: "source"});

                    return;
                }

                if (
                    source.value === "custom" ||
                    source.value === "native" ||
                    (context !== "class" && source.value === "inherit")
                ) {
                    showValue("source", source.value);
                    sendChange({type: "setSource", source: source.value});
                }
            });
        }

        if (color instanceof HTMLInputElement) {
            color.addEventListener("input", () => {
                showValue("color", color.value);
                sendChange({type: "setColor", color: color.value});
            });
        }

        for (const button of row.querySelectorAll("[data-revert-field]")) {
            if (!(button instanceof HTMLButtonElement)) {
                continue;
            }

            const field = button.dataset.revertField;

            if (field !== "source" && field !== "color") {
                continue;
            }

            button.addEventListener("click", () => {
                if (button.disabled) {
                    return;
                }

                sendChange({type: "revertField", field});
            });
        }

        for (const button of row.querySelectorAll("[data-reset-field]")) {
            if (!(button instanceof HTMLButtonElement)) {
                continue;
            }

            const field = button.dataset.resetField;

            if (field !== "source" && field !== "color") {
                continue;
            }

            button.addEventListener("click", () => {
                if (button.disabled) {
                    return;
                }

                if (field === "source" && source instanceof HTMLSelectElement) {
                    source.value = "";
                }

                if (field === "color" && color instanceof HTMLInputElement) {
                    color.value = "";
                }

                showValue(field, undefined);
                sendChange({type: "resetField", field});
            });
        }
    }

    vscode.postMessage({type: "ready"});

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
