package io.github.hedgerock.throwablehighlighter;

import com.intellij.openapi.editor.colors.TextAttributesKey;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;
import org.jetbrains.annotations.Nls;
import org.jetbrains.annotations.NotNull;
import org.jetbrains.annotations.Nullable;

final class ThrowableHighlightingStyles {

    private static final Map<ThrowableHighlightingContext, ContextStyles> STYLES = Map.of(
            ThrowableHighlightingContext.CLASS,
            new ContextStyles(
                    new StyleDefinition("Class//Base attributes", ThrowableHighlighting.THROWABLE_CLASS, null),
                    Map.of(
                            ThrowableCategory.CHECKED,
                            new StyleDefinition(
                                    "Class//Checked", ThrowableHighlighting.THROWABLE_CHECKED, "throwableChecked"),
                            ThrowableCategory.RUNTIME_EXCEPTION,
                            new StyleDefinition(
                                    "Class//Runtime exception",
                                    ThrowableHighlighting.THROWABLE_RUNTIME_EXCEPTION,
                                    "throwableRuntimeException"),
                            ThrowableCategory.ERROR,
                            new StyleDefinition(
                                    "Class//Error", ThrowableHighlighting.THROWABLE_ERROR, "throwableError"))),
            ThrowableHighlightingContext.IMPORT,
            new ContextStyles(
                    new StyleDefinition("Import", ThrowableHighlighting.THROWABLE_IMPORT, "throwableImport"), Map.of()),
            ThrowableHighlightingContext.CATCH,
            new ContextStyles(
                    new StyleDefinition("Catch//Base attributes", ThrowableHighlighting.THROWABLE_CATCH, null),
                    Map.of(
                            ThrowableCategory.CHECKED,
                            new StyleDefinition(
                                    "Catch//Checked",
                                    ThrowableHighlighting.THROWABLE_CATCH_CHECKED,
                                    "throwableCatchChecked"),
                            ThrowableCategory.RUNTIME_EXCEPTION,
                            new StyleDefinition(
                                    "Catch//Runtime exception",
                                    ThrowableHighlighting.THROWABLE_CATCH_RUNTIME_EXCEPTION,
                                    "throwableCatchRuntimeException"),
                            ThrowableCategory.ERROR,
                            new StyleDefinition(
                                    "Catch//Error",
                                    ThrowableHighlighting.THROWABLE_CATCH_ERROR,
                                    "throwableCatchError"))),
            ThrowableHighlightingContext.THROWS,
            new ContextStyles(
                    new StyleDefinition("Throws", ThrowableHighlighting.THROWABLE_THROWS, "throwableThrows"), Map.of()),
            ThrowableHighlightingContext.JAVADOC,
            new ContextStyles(
                    new StyleDefinition("Javadoc", ThrowableHighlighting.THROWABLE_JAVADOC, "throwableJavadoc"),
                    Map.of()));

    private static final List<StyleDefinition> ALL_STYLE_DEFINITIONS = Arrays.stream(
                    ThrowableHighlightingContext.values())
            .flatMap(context -> {
                ContextStyles styles = forContext(context);
                return Stream.concat(
                        Stream.of(styles.baseStyleDefinition()),
                        Arrays.stream(ThrowableCategory.values())
                                .filter(styles.categoryStyles()::containsKey)
                                .map(styles::categoryStyle));
            })
            .toList();

    private ThrowableHighlightingStyles() {}

    static @NotNull ThrowableHighlightingStyles.ContextStyles forContext(
            @NotNull ThrowableHighlightingContext context) {
        ContextStyles styles = STYLES.get(context);
        if (styles == null) {
            throw new IllegalArgumentException("Unsupported highlighting context: " + context);
        }
        return styles;
    }

    static @NotNull List<StyleDefinition> allStyles() {
        return ALL_STYLE_DEFINITIONS;
    }

    record StyleDefinition(
            @Nls @NotNull String settingsPath,
            @NotNull TextAttributesKey attributesKey,
            @Nullable String previewTag) {}

    record ContextStyles(
            @NotNull ThrowableHighlightingStyles.StyleDefinition baseStyleDefinition,
            @NotNull Map<ThrowableCategory, StyleDefinition> categoryStyles) {

        ContextStyles {
            categoryStyles = Map.copyOf(categoryStyles);
        }

        boolean hasCategories() {
            return !categoryStyles.isEmpty();
        }

        @NotNull
        ThrowableHighlightingStyles.StyleDefinition categoryStyle(@NotNull ThrowableCategory category) {
            StyleDefinition styleDefinition = categoryStyles.get(category);

            if (styleDefinition == null) {
                throw new IllegalArgumentException("No style for throwable category: " + category);
            }

            return styleDefinition;
        }
    }
}
