package io.github.hedgerock.throwablehighlighter;

import com.intellij.testFramework.LightProjectDescriptor;
import com.intellij.testFramework.fixtures.LightJavaCodeInsightFixtureTestCase;
import org.jetbrains.annotations.NotNull;

public final class ThrowableAnnotatorTest
        extends LightJavaCodeInsightFixtureTestCase {

    @Override
    protected @NotNull LightProjectDescriptor getProjectDescriptor() {
        return JAVA_21;
    }

    public void testShouldHighlightCustomThrowableDeclarationAndReference() {
        configureJava("""
            class CustomException extends RuntimeException {
            }

            class Example {
                CustomException exception;
            }
            """);

        assertEquals(
                2,
                countThrowableHighlights("CustomException")
        );
    }

    public void testShouldHighlightThrowableReference() {
        configureJava("""
            class Example {
                RuntimeException exception;
            }
            """);

        assertEquals(
                1,
                countThrowableHighlights("RuntimeException")
        );
    }

    public void testShouldHighlightThrowableItself() {
        configureJava("""
            class Example {
                Throwable throwable;
            }
            """);

        assertEquals(
                1,
                countThrowableHighlights("Throwable")
        );
    }

    public void testShouldNotHighlightRegularClass() {
        configureJava("""
            class Example {
                String value;
            }
            """);

        assertEquals(
                0,
                countThrowableHighlights("String")
        );
    }

    public void testShouldHighlightThrowableInDifferentContexts() {
        configureJava("""
            class CustomException extends RuntimeException {
            }

            class Example extends CustomException {

                private CustomException field;

                void execute() throws CustomException {
                    CustomException local = new CustomException();

                    try {
                        throw local;
                    } catch (CustomException exception) {
                    }
                }
            }
            """);

        assertEquals(
                7,
                countThrowableHighlights("CustomException")
        );
    }

    private void configureJava(String text) {
        myFixture.configureByText(
                "Example.java",
                text
        );

        myFixture.checkHighlighting();
    }

    private long countThrowableHighlights(String text) {
        return myFixture.doHighlighting().stream()
                .filter(highlight ->
                        text.equals(highlight.getText())
                                && ThrowableHighlighting.THROWABLE_CLASS.equals(
                                highlight.forcedTextAttributesKey
                        )
                )
                .count();
    }
}
