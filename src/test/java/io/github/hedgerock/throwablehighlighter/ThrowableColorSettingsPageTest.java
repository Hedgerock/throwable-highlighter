package io.github.hedgerock.throwablehighlighter;

import com.intellij.openapi.editor.colors.TextAttributesKey;
import com.intellij.openapi.options.colors.AttributesDescriptor;
import junit.framework.TestCase;

import java.util.Map;

public final class ThrowableColorSettingsPageTest extends TestCase {

    private final ThrowableColorSettingsPage page =
            new ThrowableColorSettingsPage();

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
