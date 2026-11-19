package io.github.hedgerock.throwablehighlighter;

import com.intellij.openapi.editor.colors.TextAttributesKey;
import com.intellij.openapi.options.colors.AttributesDescriptor;
import com.intellij.psi.JavaTokenType;
import java.util.Arrays;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import junit.framework.TestCase;

public final class ThrowableColorSettingsPageTest extends TestCase {

    private final ThrowableColorSettingsPage page = new ThrowableColorSettingsPage();

    public void testShouldMapTagToThrowableJavadocHighlighting() {
        Map<String, TextAttributesKey> highlighting = page.getAdditionalHighlightingTagToDescriptorMap();
        assertEquals(ThrowableHighlighting.THROWABLE_JAVADOC, highlighting.get("throwableJavadoc"));
    }

    public void testShouldContainBothJavadocExceptionTagsInDemoText() {
        String demoText = page.getDemoText();

        assertTrue(demoText.contains("@throws <throwableJavadoc>ApplicationException</throwableJavadoc>"));

        assertTrue(
                demoText.contains("@exception java.lang.<throwableJavadoc>IllegalStateException</throwableJavadoc>"));
    }

    public void testShouldUseJavaSyntaxHighlighting() {
        assertTrue(page.getHighlighter().getTokenHighlights(JavaTokenType.PUBLIC_KEYWORD).length > 0);

        assertTrue(page.getHighlighter().getTokenHighlights(JavaTokenType.END_OF_LINE_COMMENT).length > 0);
    }

    public void testShouldMapDemoTagToThrowableThrowsHighlighting() {
        Map<String, TextAttributesKey> highlighting = page.getAdditionalHighlightingTagToDescriptorMap();

        assertEquals(ThrowableHighlighting.THROWABLE_THROWS, highlighting.get("throwableThrows"));
    }

    public void testShouldContainThrowableThrowsTagInDemoText() {
        String demoText = page.getDemoText();

        assertTrue(demoText.contains("<throwableThrows>"));
        assertTrue(demoText.contains("</throwableThrows>"));
    }

    public void testShouldContainThrowableImportTagInDemoText() {
        String demoText = page.getDemoText();

        assertTrue(demoText.contains("<throwableImport>"));
        assertTrue(demoText.contains("</throwableImport>"));
    }

    public void testShouldMapDemoTagToThrowableImportHighlighting() {
        Map<String, TextAttributesKey> highlighting = page.getAdditionalHighlightingTagToDescriptorMap();

        assertNotNull(highlighting);
        assertEquals(ThrowableHighlighting.THROWABLE_IMPORT, highlighting.get("throwableImport"));
    }

    public void testShouldExposeCatalogStylesAsDescriptors() {
        Map<TextAttributesKey, String> expected = ThrowableHighlightingStyles.allStyles().stream()
                .collect(Collectors.toMap(
                        ThrowableHighlightingStyles.StyleDefinition::attributesKey,
                        ThrowableHighlightingStyles.StyleDefinition::settingsPath));

        AttributesDescriptor[] descriptors = page.getAttributeDescriptors();
        Map<TextAttributesKey, String> actual = Arrays.stream(descriptors)
                .collect(Collectors.toMap(AttributesDescriptor::getKey, AttributesDescriptor::getDisplayName));

        assertEquals(expected.size(), descriptors.length);
        assertEquals(expected, actual);
    }

    public void testShouldUseDescriptorKeysForEveryPreviewTag() {
        Set<TextAttributesKey> descriptorKeys = Arrays.stream(page.getAttributeDescriptors())
                .map(AttributesDescriptor::getKey)
                .collect(Collectors.toSet());

        Map<String, TextAttributesKey> tags = page.getAdditionalHighlightingTagToDescriptorMap();

        assertEquals(9, tags.size());
        assertTrue(descriptorKeys.containsAll(tags.values()));
    }

    public void testShouldPreviewMixedCatchCategories() {
        String demoText = page.getDemoText();

        assertTrue(demoText.contains("catch (<throwableCatchChecked>CheckedException</throwableCatchChecked>"));

        assertTrue(demoText.contains(
                "| <throwableCatchRuntimeException>ApplicationException</throwableCatchRuntimeException>"));
    }

    public void testShouldPreviewErrorCatch() {
        assertTrue(page.getDemoText().contains("catch (<throwableCatchError>ApplicationError</throwableCatchError>"));
    }

    public void testShouldMapDemoTagsToCatchCategories() {
        Map<String, TextAttributesKey> highlighting = page.getAdditionalHighlightingTagToDescriptorMap();

        assertEquals(ThrowableHighlighting.THROWABLE_CATCH_CHECKED, highlighting.get("throwableCatchChecked"));

        assertEquals(
                ThrowableHighlighting.THROWABLE_CATCH_RUNTIME_EXCEPTION,
                highlighting.get("throwableCatchRuntimeException"));

        assertEquals(ThrowableHighlighting.THROWABLE_CATCH_ERROR, highlighting.get("throwableCatchError"));
    }

    public void testShouldMapDemoTagsToThrowableCategories() {
        Map<String, TextAttributesKey> highlighting = page.getAdditionalHighlightingTagToDescriptorMap();

        assertEquals(ThrowableHighlighting.THROWABLE_CHECKED, highlighting.get("throwableChecked"));

        assertEquals(ThrowableHighlighting.THROWABLE_RUNTIME_EXCEPTION, highlighting.get("throwableRuntimeException"));

        assertEquals(ThrowableHighlighting.THROWABLE_ERROR, highlighting.get("throwableError"));
    }

    public void testShouldPreviewCheckedClassDeclaration() {
        String demoText = page.getDemoText();

        assertTrue(demoText.contains("class <throwableChecked>CheckedException</throwableChecked>"));

        assertTrue(demoText.contains("extends <throwableChecked>IOException</throwableChecked>"));
    }

    public void testShouldPreviewRuntimeExceptionClassDeclaration() {
        String demoText = page.getDemoText();

        assertTrue(
                demoText.contains("class <throwableRuntimeException>ApplicationException</throwableRuntimeException>"));

        assertTrue(
                demoText.contains("extends <throwableRuntimeException>RuntimeException</throwableRuntimeException>"));
    }

    public void testShouldPreviewErrorClassDeclaration() {
        String demoText = page.getDemoText();

        assertTrue(demoText.contains("class <throwableError>ApplicationError</throwableError>"));

        assertTrue(demoText.contains("extends <throwableError>Error</throwableError>"));
    }
}
