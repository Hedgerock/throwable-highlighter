package io.github.hedgerock.throwablehighlighter;

import com.intellij.openapi.editor.colors.TextAttributesKey;
import com.intellij.openapi.options.colors.AttributesDescriptor;
import com.intellij.psi.JavaTokenType;
import junit.framework.TestCase;

import java.util.Map;

public final class ThrowableColorSettingsPageTest extends TestCase {

    private final ThrowableColorSettingsPage page =
            new ThrowableColorSettingsPage();

    public void testShouldUseJavaSyntaxHighlighting() {
        assertTrue(
                page.getHighlighter()
                        .getTokenHighlights(JavaTokenType.PUBLIC_KEYWORD)
                        .length > 0
        );

        assertTrue(
                page.getHighlighter()
                        .getTokenHighlights(JavaTokenType.END_OF_LINE_COMMENT)
                        .length > 0
        );
    }

    public void testShouldContainThrowableImportTagInDemoText() {
        String demoText = page.getDemoText();

        assertTrue(demoText.contains("<throwableImport>"));
        assertTrue(demoText.contains("</throwableImport>"));
    }

    public void testShouldMapDemoTagToThrowableImportHighlighting() {
        Map<String, TextAttributesKey> highlighting =
                page.getAdditionalHighlightingTagToDescriptorMap();

        assertNotNull(highlighting);
        assertEquals(
                ThrowableHighlighting.THROWABLE_IMPORT,
                highlighting.get("throwableImport")
        );
    }

    public void testShouldExposeThrowableHighlightingDescriptor() {
        AttributesDescriptor[] descriptors =
                page.getAttributeDescriptors();

        assertEquals(2, descriptors.length);
        assertEquals(
                ThrowableHighlighting.THROWABLE_CLASS,
                descriptors[0].getKey()
        );
        assertEquals(
                ThrowableHighlighting.THROWABLE_IMPORT,
                descriptors[1].getKey()
        );
    }

    public void testShouldMapDemoTagToThrowableHighlighting() {
        Map<String, TextAttributesKey> highlighting =
                page.getAdditionalHighlightingTagToDescriptorMap();

        assertNotNull(highlighting);
        assertEquals(
                ThrowableHighlighting.THROWABLE_CLASS,
                highlighting.get("throwable")
        );
    }

    public void testShouldContainThrowableTagInDemoText() {
        String demoText = page.getDemoText();

        assertTrue(demoText.contains("<throwable>"));
        assertTrue(demoText.contains("</throwable>"));
    }
}
