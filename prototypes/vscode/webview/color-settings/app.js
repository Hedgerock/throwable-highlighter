(() => {
    const vscode = acquireVsCodeApi();
    const target = document.getElementById("settings-target");

    if (!(target instanceof HTMLSelectElement)) {
        return;
    }

    const renderedTarget = target.value;
    const ownColors = new Map();
    const editingOpacity = new WeakSet();
    let currentState;
    let isChangingTarget = false;
    let isApplying = false;
    let pendingEdits = 0;

    const draftStatus = document.getElementById("draft-status");
    const discard = document.getElementById("discard-draft");
    const apply = document.getElementById("apply-draft");

    target.addEventListener("change", () => {
        if (target.disabled || isInteractionLocked() || pendingEdits > 0) {
            target.value = renderedTarget;
            return;
        }

        if ((target.value === "user" || target.value === "workspace") && target.value !== renderedTarget) {
            isChangingTarget = true;
            disableEditingControls();
            updateActions();
            vscode.postMessage({type: "selectTarget", target: target.value});
        }
    });

    window.addEventListener("message", event => {
        const message = event.data;

        if (
            isChangingTarget ||
            message === null ||
            typeof message !== "object" ||
            (message.type !== "draftState" && message.type !== "fieldReverted") ||
            message.target !== target.value ||
            typeof message.isDirty !== "boolean" ||
            typeof message.isApplying !== "boolean" ||
            !isControlState(message.controls) ||
            !isPreview(message.preview)
        ) {
            return;
        }

        if (message.type === "fieldReverted" && !applyRevertedField(message)) {
            return;
        }

        pendingEdits = Math.max(0, pendingEdits - 1);
        isApplying = message.isApplying;
        currentState = message;
        applyPresentation();
    });

    function isInteractionLocked() {
        return isChangingTarget || isApplying || currentState === undefined;
    }

    function disableEditingControls() {
        for (const control of document.querySelectorAll(
            "tbody select, tbody input, tbody button, .panel-actions button"
        )) {
            if (
                control instanceof HTMLInputElement ||
                control instanceof HTMLSelectElement ||
                control instanceof HTMLButtonElement
            ) {
                control.disabled = true;
            }
        }
    }

    function updateActions() {
        const locked = isInteractionLocked() || pendingEdits > 0;
        const canSubmit = !locked && currentState?.isDirty === true;
        target.disabled = locked;

        if (discard instanceof HTMLButtonElement) {
            discard.disabled = !canSubmit;
        }

        if (apply instanceof HTMLButtonElement) {
            apply.disabled = !canSubmit;
            apply.textContent = isApplying ? "Applying..." : "Apply";
        }

        if (draftStatus instanceof HTMLElement) {
            draftStatus.textContent = isChangingTarget
                ? "Loading settings scope..."
                : isApplying
                  ? "Applying changes in this scope..."
                  : currentState === undefined
                    ? "Loading draft state..."
                    : currentState.isDirty
                      ? "Unapplied changes in this scope."
                      : "No unapplied changes in this scope.";
        }
    }

    function isColorPreview(preview) {
        if (preview === null || typeof preview !== "object") {
            return false;
        }

        switch (preview.kind) {
            case "color":
                return typeof preview.color === "string";
            case "native":
                return true;
            case "invalid":
                return (
                    ["class", "import", "catch", "throws"].includes(preview.context) &&
                    ["invalid-source", "invalid-color", "class-inheritance"].includes(preview.reason)
                );
            default:
                return false;
        }
    }

    function isPreview(preview) {
        return (
            preview !== null &&
            typeof preview === "object" &&
            ["class", "import", "catch", "throws"].every(context => isColorPreview(preview[context]))
        );
    }

    function isColorLocked(context, source) {
        return source === "native" || (context !== "class" && source === "inherit");
    }

    function formatCompactPreview(preview) {
        if (preview === undefined) {
            return "Loading...";
        }

        switch (preview.kind) {
            case "color":
                return preview.color;
            case "native":
                return "Native Java";
            case "invalid":
                return "Invalid";
        }
    }

    function formatPreview(preview) {
        switch (preview.kind) {
            case "color":
                return preview.color;
            case "native":
                return "Native Java highlighting";
            case "invalid": {
                const reasons = {
                    "invalid-source": "Invalid color source",
                    "invalid-color": "Invalid color value",
                    "class-inheritance": "CLASS cannot inherit from itself"
                };

                return reasons[preview.reason] + " (" + preview.context.toUpperCase() + ")";
            }
        }
    }

    function applyPresentation() {
        if (isChangingTarget) {
            return;
        }

        for (const row of document.querySelectorAll("tbody tr[data-context]")) {
            const context = row.dataset.context;
            const source = row.querySelector('[data-setting="source"]');
            const color = row.querySelector('[data-setting="color"]');

            if (
                !["class", "import", "catch", "throws"].includes(context) ||
                !(source instanceof HTMLSelectElement) ||
                !(color instanceof HTMLInputElement)
            ) {
                continue;
            }

            source.disabled = false;

            const wasDisabled = color.disabled;
            color.disabled = isColorLocked(context, source.value);

            if (color.disabled) {
                const inherited = source.value === "native" ? {kind: "native"} : currentState?.preview.class;

                color.value = inherited?.kind === "color" ? inherited.color : "";
                color.placeholder =
                    inherited === undefined
                        ? "Loading preview..."
                        : inherited.kind === "invalid"
                          ? "Invalid CLASS configuration"
                          : "Native Java highlighting";
                color.title = inherited === undefined ? "Loading preview..." : formatPreview(inherited);
            } else {
                if (wasDisabled) {
                    color.value = ownColors.get(context) ?? "";
                }

                color.placeholder = "Not set";
                color.title = "";
            }

            updateColorControls(row, color);

            const display = row.querySelector("[data-color-preview]");
            const preview = currentState?.preview[context];

            if (display instanceof HTMLElement) {
                const title = preview === undefined ? "Preview: loading..." : "Preview: " + formatPreview(preview);
                const label = display.querySelector("[data-preview-label]");

                if (label instanceof HTMLElement) {
                    label.textContent = formatCompactPreview(preview);
                }

                updateColorSwatch(display, preview);
                display.title = title;
                display.setAttribute("aria-label", title);
                display.classList.toggle("error", preview?.kind === "invalid");
            }
        }

        if (currentState !== undefined) {
            applyControlState(currentState.controls);
        }

        if (isInteractionLocked()) {
            disableEditingControls();
        }

        updateActions();
    }

    function updateColorSwatch(display, preview) {
        const swatch = display.querySelector("[data-color-swatch]");
        const fill = display.querySelector("[data-color-swatch-fill]");

        if (!(swatch instanceof HTMLElement) || !(fill instanceof HTMLElement)) {
            return;
        }

        const color = preview?.kind === "color" ? parseHexColor(preview.color) : undefined;

        swatch.hidden = color === undefined;
        fill.style.backgroundColor = color === undefined ? "" : color.rgb + color.alpha;
    }

    function parseHexColor(value) {
        const match = /^#([\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i.exec(value.trim());

        if (match === null) {
            return undefined;
        }

        const digits = match[1].toLowerCase();
        const expanded = digits.length <= 4 ? [...digits].map(digit => digit + digit).join("") : digits;

        return {
            rgb: "#" + expanded.slice(0, 6),
            alpha: expanded.slice(6)
        };
    }

    function parseOpacityPercentage(value) {
        const normalized = value.trim().replace(",", ".");

        if (!/^(?:\d{1,3}(?:\.\d)?|\.\d)$/.test(normalized)) {
            return undefined;
        }

        const percentage = Number(normalized);

        return percentage <= 100 ? percentage : undefined;
    }

    function updateColorControls(row, color) {
        const picker = row.querySelector("[data-color-picker]");
        const opacity = row.querySelector("[data-color-opacity]");
        const percent = row.querySelector("[data-opacity-percent]");
        const parsed = parseHexColor(color.value);
        const locked = isInteractionLocked() || color.disabled;
        const alpha = parsed === undefined ? undefined : Number.parseInt(parsed.alpha || "ff", 16);
        const percentage = alpha === undefined ? undefined : Math.round((alpha * 1000) / 255) / 10;

        if (picker instanceof HTMLInputElement) {
            picker.disabled = locked;

            if (!locked && parsed !== undefined && picker.value !== parsed.rgb) {
                picker.value = parsed.rgb;
            }
        }

        if (opacity instanceof HTMLInputElement) {
            opacity.disabled = locked || alpha === undefined;

            if (alpha !== undefined && opacity.valueAsNumber !== alpha) {
                opacity.value = String(alpha);
            }

            opacity.setAttribute(
                "aria-valuetext",
                percentage === undefined ? "No complete HEX color" : percentage + "% opacity"
            );
        }

        if (percent instanceof HTMLInputElement) {
            percent.disabled = locked || alpha === undefined;

            if (percent.disabled) {
                editingOpacity.delete(percent);
            }

            if (!editingOpacity.has(percent)) {
                const value = percentage === undefined ? "" : String(percentage);

                if (percent.value !== value) {
                    percent.value = value;
                }

                percent.setAttribute("aria-invalid", "false");
                percent.title = percentage === undefined ? "No complete HEX color" : "Opacity percentage from 0 to 100";
            }
        }
    }

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

            const source = row.querySelector('[data-setting="source"]');
            const colorLocked = source instanceof HTMLSelectElement && isColorLocked(context, source.value);

            for (const button of row.querySelectorAll("[data-revert-field]")) {
                if (!(button instanceof HTMLButtonElement)) {
                    continue;
                }

                const field = button.dataset.revertField;

                if (field === "source" || field === "color") {
                    button.disabled = (field === "color" && colorLocked) || !state[context][field].canRevert;
                }
            }

            for (const button of row.querySelectorAll("[data-reset-field]")) {
                if (!(button instanceof HTMLButtonElement)) {
                    continue;
                }

                const field = button.dataset.resetField;

                if (field === "source" || field === "color") {
                    button.disabled = (field === "color" && colorLocked) || !state[context][field].canRemove;
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

    function initializeSettingsNotes() {
        const notes = document.querySelector("details.settings-notes");

        if (notes === null || !(notes instanceof HTMLDetailsElement)) {
            return;
        }

        const summary = notes.querySelector("summary");

        if (!(summary instanceof HTMLElement)) {
            return;
        }

        const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
        let animation;
        let expanded = notes.open;

        summary.setAttribute("aria-expanded", String(expanded));

        function cancelAnimation() {
            const current = animation;
            animation = undefined;
            current?.cancel();
        }

        summary.addEventListener("click", event => {
            event.preventDefault();

            const startHeight = notes.getBoundingClientRect().height;
            expanded = !expanded;
            summary.setAttribute("aria-expanded", String(expanded));
            cancelAnimation();

            if (reducedMotion.matches) {
                notes.open = expanded;
                return;
            }

            notes.open = true;

            const endHeight = expanded ? notes.getBoundingClientRect().height : summary.getBoundingClientRect().height;

            if (Math.abs(startHeight - endHeight) < 0.5) {
                notes.open = expanded;
                return;
            }

            const next = notes.animate([{height: startHeight + "px"}, {height: endHeight + "px"}], {
                duration: 180,
                easing: "ease-in-out",
                fill: "both"
            });

            animation = next;
            next.onfinish = () => {
                if (animation !== next) {
                    return;
                }

                animation = undefined;
                notes.open = expanded;
                next.cancel();
            };
        });

        notes.addEventListener("toggle", () => {
            if (animation !== undefined) {
                return;
            }

            expanded = notes.open;
            summary.setAttribute("aria-expanded", String(expanded));
        });

        reducedMotion.addEventListener("change", () => {
            if (reducedMotion.matches) {
                cancelAnimation();
                notes.open = expanded;
            }
        });
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

            const ownColor = typeof message.value === "string" ? message.value : "";

            ownColors.set(message.context, ownColor);
            control.value = ownColor;
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
            const text = formatScopedValue(message.value, message.field);

            display.textContent = text;
            display.parentElement?.setAttribute("title", text);
        }

        return true;
    }

    if (apply instanceof HTMLButtonElement) {
        apply.addEventListener("click", () => {
            if (
                apply.disabled ||
                isInteractionLocked() ||
                pendingEdits > 0 ||
                !currentState?.isDirty ||
                (target.value !== "user" && target.value !== "workspace")
            ) {
                return;
            }

            isApplying = true;
            applyPresentation();
            vscode.postMessage({type: "apply", target: target.value});
        });
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
            if (!isInteractionLocked() && (target.value === "user" || target.value === "workspace")) {
                pendingEdits++;
                updateActions();
                vscode.postMessage({...message, target: target.value, context});
            }
        }

        function showValue(field, value) {
            const display = row.querySelector(`[data-value-field="${field}"] code`);

            if (display instanceof HTMLElement) {
                const text = formatScopedValue(value, field);

                display.textContent = text;
                display.parentElement?.setAttribute("title", text);
            }

            if (field === "source") {
                row.querySelector('option[value="stored"]')?.remove();
            }
        }

        if (source instanceof HTMLSelectElement) {
            source.disabled = false;

            source.addEventListener("change", () => {
                if (source.disabled || isInteractionLocked()) {
                    return;
                }

                if (source.value === "") {
                    showValue("source", undefined);
                    applyPresentation();
                    sendChange({type: "resetField", field: "source"});

                    return;
                }

                if (
                    source.value === "custom" ||
                    source.value === "native" ||
                    (context !== "class" && source.value === "inherit")
                ) {
                    showValue("source", source.value);
                    applyPresentation();
                    sendChange({type: "setSource", source: source.value});
                }
            });
        }

        if (color instanceof HTMLInputElement) {
            ownColors.set(context, color.value);

            function updateOwnColor(value) {
                if (isInteractionLocked() || color.disabled) {
                    return;
                }

                if (color.value !== value) {
                    color.value = value;
                }

                ownColors.set(context, value);
                showValue("color", value);
                updateColorControls(row, color);
                sendChange({type: "setColor", color: value});
            }

            const picker = row.querySelector("[data-color-picker]");

            if (picker instanceof HTMLInputElement) {
                picker.addEventListener("input", () => {
                    if (picker.disabled) {
                        return;
                    }

                    const selected = parseHexColor(picker.value);
                    const current = parseHexColor(color.value);

                    if (selected !== undefined && current?.rgb !== selected.rgb) {
                        updateOwnColor(selected.rgb + (current?.alpha ?? ""));
                    }
                });
            }

            const opacity = row.querySelector("[data-color-opacity]");

            if (opacity instanceof HTMLInputElement) {
                opacity.addEventListener("input", () => {
                    if (opacity.disabled) {
                        return;
                    }

                    const current = parseHexColor(color.value);
                    const alpha = opacity.valueAsNumber;

                    if (
                        current === undefined ||
                        !Number.isInteger(alpha) ||
                        alpha < 0 ||
                        alpha > 255 ||
                        alpha === Number.parseInt(current.alpha || "ff", 16)
                    ) {
                        return;
                    }

                    updateOwnColor(current.rgb + alpha.toString(16).padStart(2, "0"));
                });
            }

            const percent = row.querySelector("[data-opacity-percent]");

            if (percent instanceof HTMLInputElement) {
                const synchronize = () => {
                    editingOpacity.delete(percent);
                    updateColorControls(row, color);
                };

                percent.addEventListener("input", () => {
                    if (percent.disabled || isInteractionLocked()) {
                        return;
                    }

                    const current = parseHexColor(color.value);

                    if (current === undefined) {
                        return;
                    }

                    editingOpacity.add(percent);
                    const percentage = parseOpacityPercentage(percent.value);
                    percent.setAttribute("aria-invalid", String(percentage === undefined));
                    percent.title =
                        percentage === undefined
                            ? "Enter a percentage from 0 to 100, with at most one decimal place."
                            : "Opacity percentage from 0 to 100";

                    if (percentage === undefined) {
                        return;
                    }

                    const alpha = Math.round((percentage * 255) / 100);

                    if (alpha !== Number.parseInt(current.alpha || "ff", 16)) {
                        updateOwnColor(current.rgb + alpha.toString(16).padStart(2, "0"));
                    }
                });

                percent.addEventListener("blur", synchronize);
                percent.addEventListener("keydown", event => {
                    if (event.key === "Enter") {
                        event.preventDefault();
                        synchronize();
                    }
                });
            }

            color.addEventListener("input", () => updateOwnColor(color.value));
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
                if (button.disabled || isInteractionLocked()) {
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
                if (button.disabled || isInteractionLocked()) {
                    return;
                }

                if (field === "source" && source instanceof HTMLSelectElement) {
                    source.value = "";
                }

                if (field === "color" && color instanceof HTMLInputElement) {
                    ownColors.set(context, "");
                    color.value = "";
                    updateColorControls(row, color);
                }

                showValue(field, undefined);
                sendChange({type: "resetField", field});
            });
        }
    }

    initializeSettingsNotes();
    applyPresentation();
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
