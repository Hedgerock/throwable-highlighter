package io.github.hedgerock.throwablehighlighter;

import com.intellij.openapi.editor.colors.TextAttributesKey;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import junit.framework.TestCase;
import org.junit.Assert;

public final class ThrowableHighlightingStylesTest extends TestCase {

    public void testShouldPreserveBaseKeysForEveryContext() {
        Map<ThrowableHighlightingContext, TextAttributesKey> expected = Map.of(
                ThrowableHighlightingContext.CLASS, ThrowableHighlighting.THROWABLE_CLASS,
                ThrowableHighlightingContext.IMPORT, ThrowableHighlighting.THROWABLE_IMPORT,
                ThrowableHighlightingContext.CATCH, ThrowableHighlighting.THROWABLE_CATCH,
                ThrowableHighlightingContext.THROWS, ThrowableHighlighting.THROWABLE_THROWS,
                ThrowableHighlightingContext.JAVADOC, ThrowableHighlighting.THROWABLE_JAVADOC);

        for (ThrowableHighlightingContext context : ThrowableHighlightingContext.values()) {
            assertSame(
                    context.name(),
                    expected.get(context),
                    ThrowableHighlightingStyles.forContext(context)
                            .baseStyleDefinition()
                            .attributesKey());
        }
    }

    public void testShouldPreserveClassCategoryKeys() {
        ThrowableHighlightingStyles.ContextStyles styles =
                ThrowableHighlightingStyles.forContext(ThrowableHighlightingContext.CLASS);

        assertSame(
                ThrowableHighlighting.THROWABLE_CHECKED,
                styles.categoryStyle(ThrowableCategory.CHECKED).attributesKey());
        assertSame(
                ThrowableHighlighting.THROWABLE_RUNTIME_EXCEPTION,
                styles.categoryStyle(ThrowableCategory.RUNTIME_EXCEPTION).attributesKey());
        assertSame(
                ThrowableHighlighting.THROWABLE_ERROR,
                styles.categoryStyle(ThrowableCategory.ERROR).attributesKey());
    }

    public void testShouldPreserveCatchCategoryKeys() {
        ThrowableHighlightingStyles.ContextStyles styles =
                ThrowableHighlightingStyles.forContext(ThrowableHighlightingContext.CATCH);

        assertSame(
                ThrowableHighlighting.THROWABLE_CATCH_CHECKED,
                styles.categoryStyle(ThrowableCategory.CHECKED).attributesKey());
        assertSame(
                ThrowableHighlighting.THROWABLE_CATCH_RUNTIME_EXCEPTION,
                styles.categoryStyle(ThrowableCategory.RUNTIME_EXCEPTION).attributesKey());
        assertSame(
                ThrowableHighlighting.THROWABLE_CATCH_ERROR,
                styles.categoryStyle(ThrowableCategory.ERROR).attributesKey());
    }

    public void testShouldUseCategoriesOnlyForClassAndCatch() {
        Set<ThrowableHighlightingContext> categorized =
                Set.of(ThrowableHighlightingContext.CLASS, ThrowableHighlightingContext.CATCH);

        for (ThrowableHighlightingContext context : ThrowableHighlightingContext.values()) {
            assertEquals(
                    context.name(),
                    categorized.contains(context),
                    ThrowableHighlightingStyles.forContext(context).hasCategories());
        }
    }

    public void testShouldExposeEveryColorSettingOnce() {
        Map<String, String> expected = Map.ofEntries(
                Map.entry("THROWABLE_CLASS", "Class//Base attributes"),
                Map.entry("THROWABLE_CHECKED", "Class//Checked"),
                Map.entry("THROWABLE_RUNTIME_EXCEPTION", "Class//Runtime exception"),
                Map.entry("THROWABLE_ERROR", "Class//Error"),
                Map.entry("THROWABLE_IMPORT", "Import"),
                Map.entry("THROWABLE_CATCH", "Catch//Base attributes"),
                Map.entry("THROWABLE_CATCH_CHECKED", "Catch//Checked"),
                Map.entry("THROWABLE_CATCH_RUNTIME_EXCEPTION", "Catch//Runtime exception"),
                Map.entry("THROWABLE_CATCH_ERROR", "Catch//Error"),
                Map.entry("THROWABLE_THROWS", "Throws"),
                Map.entry("THROWABLE_JAVADOC", "Javadoc"));

        List<ThrowableHighlightingStyles.StyleDefinition> styleDefinitions = ThrowableHighlightingStyles.allStyles();

        Map<String, String> actual = styleDefinitions.stream()
                .collect(Collectors.toMap(
                        styleDefinition -> styleDefinition.attributesKey().getExternalName(),
                        ThrowableHighlightingStyles.StyleDefinition::settingsPath));

        assertEquals(11, styleDefinitions.size());
        assertEquals(expected, actual);
    }

    public void testShouldPreservePreviewTagBindings() {
        Map<String, String> expected = Map.of(
                "throwableChecked", "THROWABLE_CHECKED",
                "throwableRuntimeException", "THROWABLE_RUNTIME_EXCEPTION",
                "throwableError", "THROWABLE_ERROR",
                "throwableImport", "THROWABLE_IMPORT",
                "throwableCatchChecked", "THROWABLE_CATCH_CHECKED",
                "throwableCatchRuntimeException", "THROWABLE_CATCH_RUNTIME_EXCEPTION",
                "throwableCatchError", "THROWABLE_CATCH_ERROR",
                "throwableThrows", "THROWABLE_THROWS",
                "throwableJavadoc", "THROWABLE_JAVADOC");

        Map<String, String> actual = ThrowableHighlightingStyles.allStyles().stream()
                .filter(styleDefinition -> styleDefinition.previewTag() != null)
                .collect(Collectors.toMap(
                        ThrowableHighlightingStyles.StyleDefinition::previewTag,
                        styleDefinition -> styleDefinition.attributesKey().getExternalName()));

        assertEquals(expected, actual);
    }

    public void testShouldReturnImmutableStyles() {
        Assert.assertThrows(
                UnsupportedOperationException.class,
                () -> ThrowableHighlightingStyles.allStyles().clear());
    }

    public void testShouldCopyAndProtectCategoryStyles() {
        ThrowableHighlightingStyles.ContextStyles original =
                ThrowableHighlightingStyles.forContext(ThrowableHighlightingContext.CLASS);

        Map<ThrowableCategory, ThrowableHighlightingStyles.StyleDefinition> input =
                new EnumMap<>(ThrowableCategory.class);
        input.put(ThrowableCategory.CHECKED, original.categoryStyle(ThrowableCategory.CHECKED));

        ThrowableHighlightingStyles.ContextStyles copy =
                new ThrowableHighlightingStyles.ContextStyles(original.baseStyleDefinition(), input);
        input.clear();

        assertEquals(1, copy.categoryStyles().size());
        assertSame(original.categoryStyle(ThrowableCategory.CHECKED), copy.categoryStyle(ThrowableCategory.CHECKED));

        Assert.assertThrows(
                UnsupportedOperationException.class, () -> copy.categoryStyles().clear());
    }

    public void testShouldRejectCategoriesForPlainContexts() {
        for (ThrowableHighlightingContext context : List.of(
                ThrowableHighlightingContext.IMPORT,
                ThrowableHighlightingContext.THROWS,
                ThrowableHighlightingContext.JAVADOC)) {
            Assert.assertThrows(
                    IllegalArgumentException.class,
                    () -> ThrowableHighlightingStyles.forContext(context).categoryStyle(ThrowableCategory.CHECKED));
        }
    }
}
