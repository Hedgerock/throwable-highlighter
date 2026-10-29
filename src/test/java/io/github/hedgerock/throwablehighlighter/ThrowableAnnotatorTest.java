package io.github.hedgerock.throwablehighlighter;

import com.intellij.codeInsight.daemon.impl.HighlightInfo;
import com.intellij.lang.annotation.HighlightSeverity;
import com.intellij.openapi.editor.colors.TextAttributesKey;
import com.intellij.testFramework.LightProjectDescriptor;
import com.intellij.testFramework.fixtures.LightJavaCodeInsightFixtureTestCase;
import org.jetbrains.annotations.NotNull;
import org.jetbrains.annotations.Nullable;
import com.intellij.codeInsight.daemon.DaemonCodeAnalyzer;
import com.intellij.openapi.util.Disposer;

public final class ThrowableAnnotatorTest
        extends LightJavaCodeInsightFixtureTestCase {

    @Override
    protected @NotNull LightProjectDescriptor getProjectDescriptor() {
        return JAVA_21;
    }

    @Override
    protected void setUp() throws Exception {
        super.setUp();

        ThrowableHighlightingSettings settings =
                ThrowableHighlightingSettings.getInstance();

        CatchHighlightingSource originalSource =
                settings.getCatchHighlightingSource();

        Disposer.register(
                getTestRootDisposable(),
                () -> ThrowableHighlightingSettings.getInstance()
                        .setCatchSource(originalSource)
        );

        settings.setCatchSource(CatchHighlightingSource.THROWABLE_CATCH);
    }

    public void testShouldKeepCatchBodyHighlightingWithJavaSource() {
        ThrowableHighlightingSettings.getInstance()
                .setCatchSource(CatchHighlightingSource.JAVA);

        configureJava("""
        class Example {
            void execute() {
                try {
                } catch (RuntimeException exception) {
                    RuntimeException copy = exception;
                }
            }
        }
        """);

        assertEquals(
                0,
                countHighlights(ThrowableHighlighting.THROWABLE_CATCH)
        );

        assertEquals(
                1,
                countHighlights(
                        ThrowableHighlighting.THROWABLE_CLASS,
                        "RuntimeException"
                )
        );
    }

    public void testShouldUseJavaSourceForEveryTypeInMultiCatch() {
        ThrowableHighlightingSettings.getInstance()
                .setCatchSource(CatchHighlightingSource.JAVA);

        configureJava("""
        class Example {
            void execute() {
                try {
                } catch (
                        IllegalArgumentException
                        | IllegalStateException exception
                ) {
                }
            }
        }
        """);

        assertEquals(
                0,
                countHighlights(ThrowableHighlighting.THROWABLE_CATCH)
        );

        assertEquals(
                0,
                countHighlights(ThrowableHighlighting.THROWABLE_CLASS)
        );
    }

    public void testShouldRestoreCatchHighlightingWithoutChangingOtherContexts() {
        ThrowableHighlightingSettings settings =
                ThrowableHighlightingSettings.getInstance();

        settings.setCatchSource(CatchHighlightingSource.JAVA);

        configureIOExceptionContexts();

        assertEquals(
                0,
                countHighlights(ThrowableHighlighting.THROWABLE_CATCH)
        );

        assertEquals(
                3,
                countHighlights(
                        ThrowableHighlighting.THROWABLE_CLASS,
                        "IOException"
                )
        );

        assertEquals(
                1,
                countHighlights(
                        ThrowableHighlighting.THROWABLE_IMPORT,
                        "IOException"
                )
        );

        assertEquals(
                1,
                countHighlights(
                        ThrowableHighlighting.THROWABLE_JAVADOC,
                        "IOException"
                )
        );

        assertEquals(
                1,
                countHighlights(
                        ThrowableHighlighting.THROWABLE_THROWS,
                        "IOException"
                )
        );

        settings.setCatchSource(CatchHighlightingSource.THROWABLE_CATCH);

        DaemonCodeAnalyzer.getInstance(getProject()).restart(
                myFixture.getFile(),
                "Throwable Highlighter: catch highlighting source changed"
        );

        assertEquals(
                1,
                countHighlights(
                        ThrowableHighlighting.THROWABLE_CATCH,
                        "IOException"
                )
        );

        assertEquals(
                3,
                countHighlights(
                        ThrowableHighlighting.THROWABLE_CLASS,
                        "IOException"
                )
        );
    }

    public void testShouldUseJavadocContextForThrowableItself() {
        configureJava("""
        class Example {
            /**
             * @throws Throwable if execution fails
             */
            void execute() throws Throwable {
            }
        }
        """);

        assertEquals(
                1,
                countHighlights(
                        ThrowableHighlighting.THROWABLE_JAVADOC,
                        "Throwable"
                )
        );

        assertEquals(
                1,
                countHighlights(
                        ThrowableHighlighting.THROWABLE_THROWS,
                        "Throwable"
                )
        );

        assertEquals(
                0,
                countHighlights(
                        ThrowableHighlighting.THROWABLE_CLASS,
                        "Throwable"
                )
        );
    }

    public void testShouldHighlightOnlyNestedClassNameInJavadoc() {
        configureJava("""
        class OuterException extends RuntimeException {
            static class NestedException extends RuntimeException {
            }
        }

        class Example {
            /**
             * @throws OuterException.NestedException if execution fails
             */
            void execute() {
            }
        }
        """);

        assertEquals(
                1,
                countHighlights(ThrowableHighlighting.THROWABLE_JAVADOC)
        );

        assertEquals(
                1,
                countHighlights(
                        ThrowableHighlighting.THROWABLE_CLASS,
                        "OuterException"
                )
        );

        assertEquals(
                1,
                countHighlights(
                        ThrowableHighlighting.THROWABLE_CLASS,
                        "NestedException"
                )
        );

        HighlightInfo javadocHighlight = myFixture.doHighlighting().stream()
                .filter(highlightInfo ->
                        ThrowableHighlighting.THROWABLE_JAVADOC.equals(
                                highlightInfo.forcedTextAttributesKey
                        )
                )
                .findFirst()
                .orElseThrow();

        String text = myFixture.getFile().getText();

        int expectedStartOffset =
                text.indexOf("OuterException.NestedException")
                        + "OuterException.".length();

        assertEquals(
                expectedStartOffset,
                javadocHighlight.getStartOffset()
        );

        assertEquals(
                expectedStartOffset + "NestedException".length(),
                javadocHighlight.getEndOffset()
        );
    }

    public void testShouldKeepHighlightingContextsIndependentWithJavadoc() {
        configureIOExceptionContexts();

        assertEquals(
                3,
                countHighlights(
                        ThrowableHighlighting.THROWABLE_CLASS,
                        "IOException"
                )
        );

        assertEquals(
                1,
                countHighlights(
                        ThrowableHighlighting.THROWABLE_IMPORT,
                        "IOException"
                )
        );

        assertEquals(
                1,
                countHighlights(
                        ThrowableHighlighting.THROWABLE_JAVADOC,
                        "IOException",
                        HighlightSeverity.INFORMATION
                )
        );

        assertEquals(
                1,
                countHighlights(
                        ThrowableHighlighting.THROWABLE_THROWS,
                        "IOException"
                )
        );

        assertEquals(
                1,
                countHighlights(
                        ThrowableHighlighting.THROWABLE_CATCH,
                        "IOException"
                )
        );
    }

    public void testShouldNotHighlightNonThrowableJavadocType() {
        myFixture.configureByText(
                "Example.java",
                """
                class Example {
                    /**
                     * @throws String if execution fails
                     */
                    void execute() {
                    }
                }
                """
        );

        assertEquals(
                0,
                countHighlights(ThrowableHighlighting.THROWABLE_JAVADOC)
        );

        assertEquals(
                0,
                countHighlights(ThrowableHighlighting.THROWABLE_CLASS)
        );
    }

    public void testShouldNotHighlightUnresolvedJavadocType() {
        myFixture.configureByText(
                "Example.java",
                """
                class Example {
                    /**
                     * @exception MissingException if execution fails
                     */
                    void execute() {
                    }
                }
                """
        );

        assertEquals(
                0,
                countHighlights(ThrowableHighlighting.THROWABLE_JAVADOC)
        );

        assertEquals(
                0,
                countHighlights(ThrowableHighlighting.THROWABLE_CLASS)
        );
    }

    public void testShouldNotHighlightEmptyOrIncompleteJavadocExceptionTags() {
        myFixture.configureByText(
                "Example.java",
                """
                class Example {
                    /**
                     * @throws
                     * @exception
                     * @throws java.lang.
                     */
                    void execute() {
                    }
                }
                """
        );

        assertEquals(
                0,
                countHighlights(ThrowableHighlighting.THROWABLE_JAVADOC)
        );

        assertEquals(
                0,
                countHighlights(ThrowableHighlighting.THROWABLE_CLASS)
        );
    }

    public void testShouldNotHighlightExceptionTagsOnClassesAndFields() {
        myFixture.configureByText(
                "Example.java",
                """
                /**
                 * @throws RuntimeException if initialization fails
                 */
                class Example {
                    /**
                     * @exception IllegalStateException if the value is invalid
                     */
                    private int value;
                }
                """
        );

        assertEquals(
                0,
                countHighlights(ThrowableHighlighting.THROWABLE_JAVADOC)
        );

        assertEquals(
                0,
                countHighlights(ThrowableHighlighting.THROWABLE_CLASS)
        );
    }

    public void testShouldNotHighlightInlineExceptionTags() {
        myFixture.configureByText(
                "Example.java",
                """
                class Example {
                    /**
                     * Uses {@throws RuntimeException}
                     * and {@exception IllegalStateException}.
                     */
                    void execute() {
                    }
                }
                """
        );

        assertEquals(
                0,
                countHighlights(ThrowableHighlighting.THROWABLE_JAVADOC)
        );

        assertEquals(
                0,
                countHighlights(ThrowableHighlighting.THROWABLE_CLASS)
        );
    }

    public void testShouldKeepOtherJavadocReferencesOutsidePluginHighlighting() {
        configureJava("""
        class Example {
            /**
             * Uses {@link RuntimeException}
             * and {@linkplain IllegalStateException}.
             *
             * @param exception a {@link RuntimeException}
             * @return a {@link RuntimeException}
             * @see RuntimeException
             */
            RuntimeException execute(RuntimeException exception) {
                return exception;
            }
        }
        """);

        assertEquals(
                0,
                countHighlights(ThrowableHighlighting.THROWABLE_JAVADOC)
        );

        assertEquals(
                2,
                countHighlights(
                        ThrowableHighlighting.THROWABLE_CLASS,
                        "RuntimeException"
                )
        );

        assertEquals(
                0,
                countHighlights(
                        ThrowableHighlighting.THROWABLE_CLASS,
                        "IllegalStateException"
                )
        );
    }

    public void testShouldUseJavadocContextForEveryExceptionTag() {
        configureJava("""
        class Example {
            /**
             * @throws RuntimeException if execution fails
             * @throws IllegalArgumentException if an argument is invalid
             * @exception IllegalStateException if the state is invalid
             */
            void execute() {
            }
        }
        """);

        assertEquals(
                3,
                countHighlights(ThrowableHighlighting.THROWABLE_JAVADOC)
        );

        assertEquals(
                1,
                countHighlights(ThrowableHighlighting.THROWABLE_JAVADOC, "RuntimeException")
        );

        assertEquals(
                1,
                countHighlights(ThrowableHighlighting.THROWABLE_JAVADOC, "IllegalArgumentException")
        );

        assertEquals(
                1,
                countHighlights(ThrowableHighlighting.THROWABLE_JAVADOC, "IllegalStateException")
        );

        assertEquals(
                0,
                countHighlights(ThrowableHighlighting.THROWABLE_CLASS)
        );
    }

    public void testShouldUseJavadocContextForTransitiveThrowableType() {
        configureJava("""
        class BaseException extends RuntimeException {
        }

        class CustomException extends BaseException {
        }

        class Example {
            /**
             * @exception CustomException if execution fails
             */
            void execute() {
            }
        }
        """);

        assertEquals(
                1,
                countHighlights(ThrowableHighlighting.THROWABLE_JAVADOC, "CustomException")
        );

        assertEquals(
                1,
                countHighlights(ThrowableHighlighting.THROWABLE_CLASS, "CustomException")
        );
    }

    public void testShouldUseJavadocContextForCustomThrowableType() {
        configureJava("""
        class CustomException extends RuntimeException {
        }

        class Example {
            /**
             * @throws CustomException if execution fails
             */
            void execute() {
            }
        }
        """);

        assertEquals(
                1,
                countHighlights(ThrowableHighlighting.THROWABLE_JAVADOC, "CustomException")
        );

        assertEquals(
                1,
                countHighlights(ThrowableHighlighting.THROWABLE_CLASS, "CustomException")
        );
    }

    public void testShouldUseJavadocContextForThrowableThrowsTag() {
        configureJava("""
        class Example {
            /**
             * @throws RuntimeException if execution fails
             */
            void execute() {
            }
        }
        """);

        assertEquals(
                1,
                countHighlights(
                        ThrowableHighlighting.THROWABLE_JAVADOC,
                        "RuntimeException"
                )
        );

        assertEquals(
                0,
                countHighlights(
                        ThrowableHighlighting.THROWABLE_CLASS,
                        "RuntimeException"
                )
        );
    }

    public void testShouldHighlightOnlyClassNameInQualifiedConstructorExceptionTag() {
        configureJava("""
        class Example {
            /**
             * @exception java.lang.RuntimeException if initialization fails
             */
            Example() {
            }
        }
        """);

        assertEquals(
                1,
                countHighlights(
                        ThrowableHighlighting.THROWABLE_JAVADOC,
                        "RuntimeException"
                )
        );

        assertEquals(
                0,
                countHighlights(
                        ThrowableHighlighting.THROWABLE_CLASS,
                        "RuntimeException"
                )
        );
    }

    public void testShouldNotHighlightNonThrowableThrowsType() {
        myFixture.configureByText(
                "Example.java",
                """
                        class Example {
    
                            void execute() throws String {
                            }
                        }
                        """
        );

        assertEquals(
                0,
                countHighlights(
                        ThrowableHighlighting.THROWABLE_THROWS,
                        "String"
                )
        );

        assertEquals(
                0,
                countHighlights(
                        ThrowableHighlighting.THROWABLE_CLASS,
                        "String"
                )
        );
    }

    public void testShouldUseThrowsContextForEveryThrowableTypeInThrowsList() {
        configureJava("""
        import java.io.IOException;

        class Example {

            void execute() throws IOException, IllegalArgumentException {
            }
        }
        """);

        assertEquals(
                1,
                countHighlights(
                        ThrowableHighlighting.THROWABLE_THROWS,
                        "IOException"
                )
        );

        assertEquals(
                1,
                countHighlights(
                        ThrowableHighlighting.THROWABLE_THROWS,
                        "IllegalArgumentException"
                )
        );

        assertEquals(
                0,
                countHighlights(
                        ThrowableHighlighting.THROWABLE_CLASS,
                        "IOException"
                )
        );

        assertEquals(
                0,
                countHighlights(
                        ThrowableHighlighting.THROWABLE_CLASS,
                        "IllegalArgumentException"
                )
        );
    }

    public void testShouldUseThrowsContextForThrowableConstructorType() {
        configureJava("""
        import java.io.IOException;
        
         class Example {

             Example() throws IOException {
             }
         }
        """);

        assertEquals(
                1,
                countHighlights(
                        ThrowableHighlighting.THROWABLE_THROWS,
                        "IOException"
                )
        );

        assertEquals(
                0,
                countHighlights(
                        ThrowableHighlighting.THROWABLE_CLASS,
                        "IOException"
                )
        );
    }

    public void testShouldUseThrowsContextForThrowableMethodType() {
        configureJava("""
        class Example {

            void execute() throws RuntimeException {
                RuntimeException copy = null;
            }
        }
        """);

        assertEquals(
                1,
                countHighlights(
                        ThrowableHighlighting.THROWABLE_THROWS,
                        "RuntimeException"
                )
        );

        assertEquals(
                1,
                countHighlights(
                        ThrowableHighlighting.THROWABLE_CLASS,
                        "RuntimeException"
                )
        );
    }

    public void testShouldUseCatchContextForEveryThrowableTypeInMultiCatch() {
        configureJava("""
        class Example {

            void execute() {
                try {
                } catch (
                        IllegalArgumentException
                        | IllegalStateException exception
                ) {
                }
            }
        }
        """);

        assertEquals(
                1,
                countHighlights(
                        ThrowableHighlighting.THROWABLE_CATCH,
                        "IllegalArgumentException"
                )
        );

        assertEquals(
                1,
                countHighlights(
                        ThrowableHighlighting.THROWABLE_CATCH,
                        "IllegalStateException"
                )
        );

        assertEquals(
                0,
                countHighlights(
                        ThrowableHighlighting.THROWABLE_CLASS,
                        "IllegalArgumentException"
                )
        );

        assertEquals(
                0,
                countHighlights(
                        ThrowableHighlighting.THROWABLE_CLASS,
                        "IllegalStateException"
                )
        );
    }

    public void testShouldUseCatchContextForThrowableCatchType() {
        configureJava("""
        class Example {

            void execute() {
                try {
                } catch (RuntimeException exception) {
                    RuntimeException copy = exception;
                }
            }
        }
        """);

        assertEquals(
                1,
                countHighlights(
                        ThrowableHighlighting.THROWABLE_CATCH,
                        "RuntimeException"
                )
        );
        assertEquals(
                1,
                countHighlights(
                        ThrowableHighlighting.THROWABLE_CLASS,
                        "RuntimeException"
                )
        );
    }

    public void testShouldNotHighlightWildcardImport() {
        myFixture.configureByText(
                "Example.java",
                """
                        import java.io.*;

                        class Example {
                        }
                        """
        );

        assertEquals(0, countHighlights(
                ThrowableHighlighting.THROWABLE_IMPORT
        ));
    }

    public void testShouldHighlightExplicitThrowableImport() {
        myFixture.configureByText(
                "Example.java",
                """
                        import java.lang.Throwable;

                        class Example {
                        }
                        """
        );

        assertEquals(1, countHighlights(ThrowableHighlighting.THROWABLE_IMPORT));
        assertEquals(
                1,
                countHighlights(
                        ThrowableHighlighting.THROWABLE_IMPORT,
                        "Throwable",
                        HighlightSeverity.TEXT_ATTRIBUTES
                )
        );
    }

    public void testShouldNotHighlightRegularImport() {
        myFixture.configureByText(
                "Example.java",
                """
                        import java.lang.String;

                        class Example {
                        }
                        """
        );

        assertEquals(0, countHighlights(ThrowableHighlighting.THROWABLE_IMPORT));
    }

    public void testShouldHighlightExplicitThrowableSubclassImport() {
        myFixture.configureByText(
                "Example.java",
                """
                import java.io.IOException;

                class Example {
                }
                """
        );

        assertEquals(1, countHighlights(
                ThrowableHighlighting.THROWABLE_IMPORT
        ));
        assertEquals(
                1,
                countHighlights(
                        ThrowableHighlighting.THROWABLE_IMPORT,
                        "IOException",
                        HighlightSeverity.TEXT_ATTRIBUTES
                )
        );
    }

    public void testThrowableImportInheritsThrowableClassColor() {
        assertSame(
                ThrowableHighlighting.THROWABLE_CLASS,
                ThrowableHighlighting.THROWABLE_IMPORT.getFallbackAttributeKey()
        );
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
                countHighlights(
                        ThrowableHighlighting.THROWABLE_CLASS,
                        "CustomException"
                )
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
                countHighlights(
                        ThrowableHighlighting.THROWABLE_CLASS,
                        "RuntimeException"
                )
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
                countHighlights(
                        ThrowableHighlighting.THROWABLE_CLASS,
                        "Throwable"
                )
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
                countHighlights(ThrowableHighlighting.THROWABLE_CLASS, "String")
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
                5,
                countHighlights(
                        ThrowableHighlighting.THROWABLE_CLASS,
                        "CustomException"
                )
        );

        assertEquals(
                1,
                countHighlights(
                        ThrowableHighlighting.THROWABLE_CATCH,
                        "CustomException"
                )
        );

        assertEquals(
                1,
                countHighlights(
                        ThrowableHighlighting.THROWABLE_THROWS,
                        "CustomException"
                )
        );
    }

    public void testShouldNotHighlightNonThrowableCatchType() {
        myFixture.configureByText(
                "Example.java",
                """
                        class Example {
    
                            void execute() {
                                try {
                                } catch (String value) {
                                }
                            }
                        }
                        """
        );

        assertEquals(
                0,
                countHighlights(
                        ThrowableHighlighting.THROWABLE_CATCH,
                        "String"
                )
        );

        assertEquals(
                0,
                countHighlights(
                        ThrowableHighlighting.THROWABLE_CLASS,
                        "String"
                )
        );
    }

    public void testShouldKeepQualifiedClassReferencesOutsideCatchAndThrows() {
        configureJava("""
        class Example<T extends java.lang.RuntimeException> {
            private java.lang.RuntimeException field;

            java.lang.RuntimeException execute(
                    java.lang.RuntimeException exception
            ) throws java.lang.IllegalStateException {
                try {
                } catch (java.lang.IllegalArgumentException caught) {
                    return caught;
                }

                return exception;
            }
        }
        """);

        assertEquals(
                4,
                countHighlights(
                        ThrowableHighlighting.THROWABLE_CLASS,
                        "java.lang.RuntimeException"
                )
        );

        assertEquals(
                1,
                countHighlights(
                        ThrowableHighlighting.THROWABLE_CATCH,
                        "java.lang.IllegalArgumentException"
                )
        );

        assertEquals(
                1,
                countHighlights(
                        ThrowableHighlighting.THROWABLE_THROWS,
                        "java.lang.IllegalStateException"
                )
        );

        assertEquals(
                0,
                countHighlights(
                        ThrowableHighlighting.THROWABLE_CLASS,
                        "java.lang.IllegalArgumentException"
                )
        );

        assertEquals(
                0,
                countHighlights(
                        ThrowableHighlighting.THROWABLE_CLASS,
                        "java.lang.IllegalStateException"
                )
        );
    }

    public void testShouldKeepHighlightingContextsInsideLocalClassInCatch() {
        configureJava("""
        class Example {
            void execute() {
                try {
                } catch (IllegalArgumentException outer) {
                    class Local {
                        /**
                         * @throws IllegalStateException if creation fails
                         */
                        Local() throws IllegalStateException {
                        }

                        void nested() throws UnsupportedOperationException {
                            try {
                            } catch (SecurityException inner) {
                                RuntimeException copy = inner;
                            }
                        }
                    }
                }
            }
        }
        """);

        assertEquals(
                1,
                countHighlights(
                        ThrowableHighlighting.THROWABLE_CATCH,
                        "IllegalArgumentException"
                )
        );

        assertEquals(
                1,
                countHighlights(
                        ThrowableHighlighting.THROWABLE_CATCH,
                        "SecurityException"
                )
        );

        assertEquals(
                1,
                countHighlights(
                        ThrowableHighlighting.THROWABLE_THROWS,
                        "IllegalStateException"
                )
        );

        assertEquals(
                1,
                countHighlights(
                        ThrowableHighlighting.THROWABLE_THROWS,
                        "UnsupportedOperationException"
                )
        );

        assertEquals(
                1,
                countHighlights(
                        ThrowableHighlighting.THROWABLE_JAVADOC,
                        "IllegalStateException"
                )
        );

        assertEquals(
                1,
                countHighlights(ThrowableHighlighting.THROWABLE_CLASS)
        );

        assertEquals(
                1,
                countHighlights(
                        ThrowableHighlighting.THROWABLE_CLASS,
                        "RuntimeException"
                )
        );
    }

    private void configureJava(String text) {
        myFixture.configureByText(
                "Example.java",
                text
        );

        myFixture.checkHighlighting();
    }

    private long countHighlights(TextAttributesKey key) {
        return countHighlights(key, null, null);
    }

    private long countHighlights(
            TextAttributesKey key,
            String text
    ) {
        return countHighlights(key, text, null);
    }

    private long countHighlights(
            TextAttributesKey key,
            @Nullable String text,
            @Nullable HighlightSeverity severity
    ) {
        return myFixture.doHighlighting().stream()
                .filter(highlightInfo -> key.equals(highlightInfo.forcedTextAttributesKey))
                .filter(highlightInfo -> text == null || text.equals(highlightInfo.getText()))
                .filter(highlightInfo -> severity == null || severity.equals(highlightInfo.getSeverity()))
                .count();
    }

    private void configureIOExceptionContexts() {
        configureJava("""
        import java.io.IOException;

        class Example {
            private IOException exception;

            /**
             * @exception IOException if execution fails
             */
            void execute() throws IOException {
                try {
                    throw new IOException();
                } catch (IOException caught) {
                    IOException copy = caught;
                }
            }
        }
        """);
    }
}
