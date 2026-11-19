package io.github.hedgerock.throwablehighlighter;

import com.intellij.codeInsight.daemon.DaemonCodeAnalyzer;
import com.intellij.codeInsight.daemon.impl.HighlightInfo;
import com.intellij.lang.annotation.HighlightSeverity;
import com.intellij.openapi.editor.colors.TextAttributesKey;
import com.intellij.openapi.util.Disposer;
import com.intellij.testFramework.LightProjectDescriptor;
import com.intellij.testFramework.fixtures.LightJavaCodeInsightFixtureTestCase;
import java.util.List;
import org.jetbrains.annotations.NotNull;
import org.jetbrains.annotations.Nullable;

public final class ThrowableAnnotatorTest extends LightJavaCodeInsightFixtureTestCase {

    private static final List<TextAttributesKey> CLASS_HIGHLIGHT_KEYS = List.of(
            ThrowableHighlighting.THROWABLE_CHECKED,
            ThrowableHighlighting.THROWABLE_RUNTIME_EXCEPTION,
            ThrowableHighlighting.THROWABLE_ERROR);

    private static final List<TextAttributesKey> CATCH_HIGHLIGHT_KEYS = List.of(
            ThrowableHighlighting.THROWABLE_CATCH_CHECKED,
            ThrowableHighlighting.THROWABLE_CATCH_RUNTIME_EXCEPTION,
            ThrowableHighlighting.THROWABLE_CATCH_ERROR);

    @Override
    protected @NotNull LightProjectDescriptor getProjectDescriptor() {
        return JAVA_21;
    }

    @Override
    protected void setUp() throws Exception {
        super.setUp();

        ThrowableHighlightingSettings settings = ThrowableHighlightingSettings.getInstance();
        ThrowableHighlightingSettings.SettingsState originalState = settings.getState();

        Disposer.register(getTestRootDisposable(), () -> settings.loadState(originalState));

        settings.loadState(new ThrowableHighlightingSettings.SettingsState());
    }

    public void testShouldKeepResolvedCatchAlternativeWhenAnotherTypeIsUnresolved() {
        myFixture.configureByText("Example.java", """
        class Example {
            void execute() {
                try {
                } catch (MissingException | RuntimeException exception) {
                }
            }
        }
        """);

        assertEquals(1, countHighlights(ThrowableHighlighting.THROWABLE_CATCH_RUNTIME_EXCEPTION, "RuntimeException"));

        assertEquals(0, countCatchHighlights("MissingException"));
        assertEquals(1, countCatchHighlights());
        assertEquals(0, countHighlights(ThrowableHighlighting.THROWABLE_CATCH));
    }

    public void testShouldKeepCatchBodyHighlightingWithJavaSource() {
        ThrowableHighlightingSettings.getInstance().setCatchSource(CatchHighlightingSource.JAVA);

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

        assertEquals(0, countCatchHighlights());

        assertEquals(1, countClassHighlights("RuntimeException"));
    }

    public void testShouldUseJavaSourceForEveryTypeInMultiCatch() {
        ThrowableHighlightingSettings.getInstance().setCatchSource(CatchHighlightingSource.JAVA);

        configureJava("""
        import java.io.IOException;

        class Example {
            void execute() {
                try {
                    throw new IOException();
                } catch (IOException | RuntimeException | Error exception) {
                }
            }
        }
        """);

        assertEquals(0, countCatchHighlights());
        assertEquals(0, countHighlights(ThrowableHighlighting.THROWABLE_CATCH));

        assertEquals(1, countHighlights(ThrowableHighlighting.THROWABLE_CHECKED, "IOException"));

        assertEquals(1, countClassHighlights());
        assertEquals(1, countHighlights(ThrowableHighlighting.THROWABLE_IMPORT, "IOException"));
    }

    public void testShouldRestoreCatchHighlightingWithoutChangingOtherContexts() {
        ThrowableHighlightingSettings settings = ThrowableHighlightingSettings.getInstance();

        settings.setCatchSource(CatchHighlightingSource.JAVA);

        configureIOExceptionContexts();

        assertEquals(0, countCatchHighlights());

        assertEquals(3, countClassHighlights("IOException"));

        assertEquals(1, countHighlights(ThrowableHighlighting.THROWABLE_IMPORT, "IOException"));

        assertEquals(1, countHighlights(ThrowableHighlighting.THROWABLE_JAVADOC, "IOException"));

        assertEquals(1, countHighlights(ThrowableHighlighting.THROWABLE_THROWS, "IOException"));

        settings.setCatchSource(CatchHighlightingSource.THROWABLE_CATCH);

        DaemonCodeAnalyzer.getInstance(getProject())
                .restart(myFixture.getFile(), "Throwable Highlighter: catch highlighting source changed");

        assertEquals(1, countCatchHighlights("IOException"));

        assertEquals(3, countClassHighlights("IOException"));
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

        assertEquals(1, countHighlights(ThrowableHighlighting.THROWABLE_JAVADOC, "Throwable"));

        assertEquals(1, countHighlights(ThrowableHighlighting.THROWABLE_THROWS, "Throwable"));

        assertEquals(0, countClassHighlights("Throwable"));
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

        assertEquals(1, countHighlights(ThrowableHighlighting.THROWABLE_JAVADOC));

        assertEquals(1, countClassHighlights("OuterException"));

        assertEquals(1, countClassHighlights("NestedException"));

        HighlightInfo javadocHighlight = myFixture.doHighlighting().stream()
                .filter(highlightInfo ->
                        ThrowableHighlighting.THROWABLE_JAVADOC.equals(highlightInfo.forcedTextAttributesKey))
                .findFirst()
                .orElseThrow();

        String text = myFixture.getFile().getText();

        int expectedStartOffset = text.indexOf("OuterException.NestedException") + "OuterException.".length();

        assertEquals(expectedStartOffset, javadocHighlight.getStartOffset());

        assertEquals(expectedStartOffset + "NestedException".length(), javadocHighlight.getEndOffset());
    }

    public void testShouldKeepHighlightingContextsIndependentWithJavadoc() {
        configureIOExceptionContexts();

        assertEquals(3, countClassHighlights("IOException"));

        assertEquals(1, countHighlights(ThrowableHighlighting.THROWABLE_IMPORT, "IOException"));

        assertEquals(
                1,
                countHighlights(ThrowableHighlighting.THROWABLE_JAVADOC, "IOException", HighlightSeverity.INFORMATION));

        assertEquals(1, countHighlights(ThrowableHighlighting.THROWABLE_THROWS, "IOException"));

        assertEquals(1, countCatchHighlights("IOException"));
    }

    public void testShouldNotHighlightNonThrowableJavadocType() {
        myFixture.configureByText("Example.java", """
                class Example {
                    /**
                     * @throws String if execution fails
                     */
                    void execute() {
                    }
                }
                """);

        assertEquals(0, countHighlights(ThrowableHighlighting.THROWABLE_JAVADOC));

        assertEquals(0, countClassHighlights());
    }

    public void testShouldNotHighlightUnresolvedJavadocType() {
        myFixture.configureByText("Example.java", """
                class Example {
                    /**
                     * @exception MissingException if execution fails
                     */
                    void execute() {
                    }
                }
                """);

        assertEquals(0, countHighlights(ThrowableHighlighting.THROWABLE_JAVADOC));

        assertEquals(0, countClassHighlights());
    }

    public void testShouldNotHighlightEmptyOrIncompleteJavadocExceptionTags() {
        myFixture.configureByText("Example.java", """
                class Example {
                    /**
                     * @throws
                     * @exception
                     * @throws java.lang.
                     */
                    void execute() {
                    }
                }
                """);

        assertEquals(0, countHighlights(ThrowableHighlighting.THROWABLE_JAVADOC));

        assertEquals(0, countClassHighlights());
    }

    public void testShouldNotHighlightExceptionTagsOnClassesAndFields() {
        myFixture.configureByText("Example.java", """
                /**
                 * @throws RuntimeException if initialization fails
                 */
                class Example {
                    /**
                     * @exception IllegalStateException if the value is invalid
                     */
                    private int value;
                }
                """);

        assertEquals(0, countHighlights(ThrowableHighlighting.THROWABLE_JAVADOC));

        assertEquals(0, countClassHighlights());
    }

    public void testShouldNotHighlightInlineExceptionTags() {
        myFixture.configureByText("Example.java", """
                class Example {
                    /**
                     * Uses {@throws RuntimeException}
                     * and {@exception IllegalStateException}.
                     */
                    void execute() {
                    }
                }
                """);

        assertEquals(0, countHighlights(ThrowableHighlighting.THROWABLE_JAVADOC));

        assertEquals(0, countClassHighlights());
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

        assertEquals(0, countHighlights(ThrowableHighlighting.THROWABLE_JAVADOC));

        assertEquals(2, countClassHighlights("RuntimeException"));

        assertEquals(0, countClassHighlights("IllegalStateException"));
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

        assertEquals(3, countHighlights(ThrowableHighlighting.THROWABLE_JAVADOC));

        assertEquals(1, countHighlights(ThrowableHighlighting.THROWABLE_JAVADOC, "RuntimeException"));

        assertEquals(1, countHighlights(ThrowableHighlighting.THROWABLE_JAVADOC, "IllegalArgumentException"));

        assertEquals(1, countHighlights(ThrowableHighlighting.THROWABLE_JAVADOC, "IllegalStateException"));

        assertEquals(0, countClassHighlights());
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

        assertEquals(1, countHighlights(ThrowableHighlighting.THROWABLE_JAVADOC, "CustomException"));

        assertEquals(1, countClassHighlights("CustomException"));
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

        assertEquals(1, countHighlights(ThrowableHighlighting.THROWABLE_JAVADOC, "CustomException"));

        assertEquals(1, countClassHighlights("CustomException"));
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

        assertEquals(1, countHighlights(ThrowableHighlighting.THROWABLE_JAVADOC, "RuntimeException"));

        assertEquals(0, countClassHighlights("RuntimeException"));
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

        assertEquals(1, countHighlights(ThrowableHighlighting.THROWABLE_JAVADOC, "RuntimeException"));

        assertEquals(0, countClassHighlights("RuntimeException"));
    }

    public void testShouldNotHighlightNonThrowableThrowsType() {
        myFixture.configureByText("Example.java", """
                        class Example {

                            void execute() throws String {
                            }
                        }
                        """);

        assertEquals(0, countHighlights(ThrowableHighlighting.THROWABLE_THROWS, "String"));

        assertEquals(0, countClassHighlights("String"));
    }

    public void testShouldUseThrowsContextForEveryThrowableTypeInThrowsList() {
        configureJava("""
        import java.io.IOException;

        class Example {

            void execute() throws IOException, IllegalArgumentException {
            }
        }
        """);

        assertEquals(1, countHighlights(ThrowableHighlighting.THROWABLE_THROWS, "IOException"));

        assertEquals(1, countHighlights(ThrowableHighlighting.THROWABLE_THROWS, "IllegalArgumentException"));

        assertEquals(0, countClassHighlights("IOException"));

        assertEquals(0, countClassHighlights("IllegalArgumentException"));
    }

    public void testShouldUseThrowsContextForThrowableConstructorType() {
        configureJava("""
        import java.io.IOException;

         class Example {

             Example() throws IOException {
             }
         }
        """);

        assertEquals(1, countHighlights(ThrowableHighlighting.THROWABLE_THROWS, "IOException"));

        assertEquals(0, countClassHighlights("IOException"));
    }

    public void testShouldUseThrowsContextForThrowableMethodType() {
        configureJava("""
        class Example {

            void execute() throws RuntimeException {
                RuntimeException copy = null;
            }
        }
        """);

        assertEquals(1, countHighlights(ThrowableHighlighting.THROWABLE_THROWS, "RuntimeException"));

        assertEquals(1, countClassHighlights("RuntimeException"));
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

        assertEquals(1, countCatchHighlights("IllegalArgumentException"));

        assertEquals(1, countCatchHighlights("IllegalStateException"));

        assertEquals(0, countClassHighlights("IllegalArgumentException"));

        assertEquals(0, countClassHighlights("IllegalStateException"));
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

        assertEquals(1, countCatchHighlights("RuntimeException"));
        assertEquals(1, countClassHighlights("RuntimeException"));
    }

    public void testShouldNotHighlightWildcardImport() {
        myFixture.configureByText("Example.java", """
                        import java.io.*;

                        class Example {
                        }
                        """);

        assertEquals(0, countHighlights(ThrowableHighlighting.THROWABLE_IMPORT));
    }

    public void testShouldHighlightExplicitThrowableImport() {
        myFixture.configureByText("Example.java", """
                        import java.lang.Throwable;

                        class Example {
                        }
                        """);

        assertEquals(1, countHighlights(ThrowableHighlighting.THROWABLE_IMPORT));
        assertEquals(
                1,
                countHighlights(
                        ThrowableHighlighting.THROWABLE_IMPORT, "Throwable", HighlightSeverity.TEXT_ATTRIBUTES));
    }

    public void testShouldNotHighlightRegularImport() {
        myFixture.configureByText("Example.java", """
                        import java.lang.String;

                        class Example {
                        }
                        """);

        assertEquals(0, countHighlights(ThrowableHighlighting.THROWABLE_IMPORT));
    }

    public void testShouldHighlightExplicitThrowableSubclassImport() {
        myFixture.configureByText("Example.java", """
                import java.io.IOException;

                class Example {
                }
                """);

        assertEquals(1, countHighlights(ThrowableHighlighting.THROWABLE_IMPORT));
        assertEquals(
                1,
                countHighlights(
                        ThrowableHighlighting.THROWABLE_IMPORT, "IOException", HighlightSeverity.TEXT_ATTRIBUTES));
    }

    public void testThrowableImportInheritsThrowableClassColor() {
        assertSame(
                ThrowableHighlighting.THROWABLE_CLASS,
                ThrowableHighlighting.THROWABLE_IMPORT.getFallbackAttributeKey());
    }

    public void testShouldHighlightCustomThrowableDeclarationAndReference() {
        configureJava("""
            class CustomException extends RuntimeException {
            }

            class Example {
                CustomException exception;
            }
            """);

        assertEquals(2, countClassHighlights("CustomException"));
    }

    public void testShouldHighlightThrowableReference() {
        configureJava("""
            class Example {
                RuntimeException exception;
            }
            """);

        assertEquals(1, countClassHighlights("RuntimeException"));
    }

    public void testShouldHighlightThrowableItself() {
        configureJava("""
            class Example {
                Throwable throwable;
            }
            """);

        assertEquals(1, countClassHighlights("Throwable"));
    }

    public void testShouldNotHighlightRegularClass() {
        configureJava("""
            class Example {
                String value;
            }
            """);

        assertEquals(0, countClassHighlights("String"));
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

        assertEquals(5, countClassHighlights("CustomException"));

        assertEquals(1, countCatchHighlights("CustomException"));

        assertEquals(1, countHighlights(ThrowableHighlighting.THROWABLE_THROWS, "CustomException"));
    }

    public void testShouldNotHighlightNonThrowableCatchType() {
        myFixture.configureByText("Example.java", """
                        class Example {

                            void execute() {
                                try {
                                } catch (String value) {
                                }
                            }
                        }
                        """);

        assertEquals(0, countCatchHighlights("String"));

        assertEquals(0, countClassHighlights("String"));
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

        assertEquals(4, countClassHighlights("java.lang.RuntimeException"));

        assertEquals(1, countCatchHighlights("java.lang.IllegalArgumentException"));

        assertEquals(1, countHighlights(ThrowableHighlighting.THROWABLE_THROWS, "java.lang.IllegalStateException"));

        assertEquals(0, countClassHighlights("java.lang.IllegalArgumentException"));

        assertEquals(0, countClassHighlights("java.lang.IllegalStateException"));
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

        assertEquals(1, countCatchHighlights("IllegalArgumentException"));

        assertEquals(1, countCatchHighlights("SecurityException"));

        assertEquals(1, countHighlights(ThrowableHighlighting.THROWABLE_THROWS, "IllegalStateException"));

        assertEquals(1, countHighlights(ThrowableHighlighting.THROWABLE_THROWS, "UnsupportedOperationException"));

        assertEquals(1, countHighlights(ThrowableHighlighting.THROWABLE_JAVADOC, "IllegalStateException"));

        assertEquals(1, countClassHighlights());

        assertEquals(1, countClassHighlights("RuntimeException"));
    }

    public void testShouldKeepOtherContextWithJavaClassSource() {
        assertOnlyContextUsesJavaSource(ThrowableHighlightingContext.CLASS);
    }

    public void testShouldKeepOtherContextWithJavaImportSource() {
        assertOnlyContextUsesJavaSource(ThrowableHighlightingContext.IMPORT);
    }

    public void testShouldKeepOtherContextWithJavaCatchSource() {
        assertOnlyContextUsesJavaSource(ThrowableHighlightingContext.CATCH);
    }

    public void testShouldKeepOtherContextWithJavaThrowsSource() {
        assertOnlyContextUsesJavaSource(ThrowableHighlightingContext.THROWS);
    }

    public void testShouldKeepOtherContextWithJavaJavadocSource() {
        assertOnlyContextUsesJavaSource(ThrowableHighlightingContext.JAVADOC);
    }

    public void testShouldUseJavaSourceForAllThrowableCategories() {
        ThrowableHighlightingSettings.getInstance()
                .setHighlightingSource(ThrowableHighlightingContext.CLASS, ThrowableHighlightingSource.JAVA);

        configureJava("""
            class CheckedException extends Exception {
            }

            class ApplicationException extends RuntimeException {
            }

            class ApplicationError extends Error {
            }

            class Example {
                private CheckedException checked;
                private ApplicationException runtime;
                private ApplicationError error;
            }
            """);

        assertEquals(0, countClassHighlights());
    }

    public void testShouldUseCategoryKeysForClassReferences() {
        configureJava("""
            class Example {
                Throwable throwable;
                Exception checked;
                RuntimeException runtime;
                Error error;
            }
            """);

        assertEquals(1, countHighlights(ThrowableHighlighting.THROWABLE_CHECKED, "Throwable"));

        assertEquals(1, countHighlights(ThrowableHighlighting.THROWABLE_CHECKED, "Exception"));

        assertEquals(1, countHighlights(ThrowableHighlighting.THROWABLE_RUNTIME_EXCEPTION, "RuntimeException"));

        assertEquals(1, countHighlights(ThrowableHighlighting.THROWABLE_ERROR, "Error"));

        assertEquals(0, countHighlights(ThrowableHighlighting.THROWABLE_CLASS));
    }

    public void testShouldUseCategoryKeysForMixedMultiCatch() {
        configureJava("""
            import java.io.IOException;

            class Example {
                void execute() {
                    try {
                        throw new IOException();
                    } catch (IOException | RuntimeException | Error exception) {
                    }
                }
            }
            """);

        assertEquals(1, countHighlights(ThrowableHighlighting.THROWABLE_CATCH_CHECKED, "IOException"));

        assertEquals(1, countHighlights(ThrowableHighlighting.THROWABLE_CATCH_RUNTIME_EXCEPTION, "RuntimeException"));

        assertEquals(1, countHighlights(ThrowableHighlighting.THROWABLE_CATCH_ERROR, "Error"));

        assertEquals(3, countCatchHighlights());
        assertEquals(0, countHighlights(ThrowableHighlighting.THROWABLE_CATCH));
    }

    public void testShouldUseCheckedKeyForClassDeclarationAndReference() {
        assertClassCategory("java.io.IOException", ThrowableHighlighting.THROWABLE_CHECKED);
    }

    public void testShouldUseRuntimeExceptionKeyForClassDeclarationAndReference() {
        assertClassCategory("java.lang.RuntimeException", ThrowableHighlighting.THROWABLE_RUNTIME_EXCEPTION);
    }

    public void testShouldUseErrorKeyForClassDeclarationAndReference() {
        assertClassCategory("java.lang.Error", ThrowableHighlighting.THROWABLE_ERROR);
    }

    private void configureJava(String text) {
        myFixture.configureByText("Example.java", text);

        myFixture.checkHighlighting();
    }

    public void testShouldUseCheckedCatchKeyForThrowableAndTransitiveSubtype() {
        assertCatchCategory("java.lang.Throwable", ThrowableHighlighting.THROWABLE_CATCH_CHECKED);
    }

    public void testShouldUseCheckedCatchKeyForExceptionAndTransitiveSubtype() {
        assertCatchCategory("java.lang.Exception", ThrowableHighlighting.THROWABLE_CATCH_CHECKED);
    }

    public void testShouldUseRuntimeCatchKeyForBaseTypeAndTransitiveSubtype() {
        assertCatchCategory("java.lang.RuntimeException", ThrowableHighlighting.THROWABLE_CATCH_RUNTIME_EXCEPTION);
    }

    public void testShouldUseErrorCatchKeyForBaseTypeAndTransitiveSubtype() {
        assertCatchCategory("java.lang.Error", ThrowableHighlighting.THROWABLE_CATCH_ERROR);
    }

    private long countCatchHighlights() {
        return countCatchHighlights(null);
    }

    private long countCatchHighlights(@Nullable String text) {
        return countHighlights(CATCH_HIGHLIGHT_KEYS, text, null);
    }

    private long countClassHighlights() {
        return countClassHighlights(null);
    }

    private long countClassHighlights(@Nullable String text) {
        return countHighlights(CLASS_HIGHLIGHT_KEYS, text, null);
    }

    private long countHighlights(TextAttributesKey key) {
        return countHighlights(key, null, null);
    }

    private long countHighlights(TextAttributesKey key, String text) {
        return countHighlights(key, text, null);
    }

    private long countHighlights(TextAttributesKey key, @Nullable String text, @Nullable HighlightSeverity severity) {
        return countHighlights(List.of(key), text, severity);
    }

    private long countHighlights(
            List<TextAttributesKey> keys, @Nullable String text, @Nullable HighlightSeverity severity) {
        return myFixture.doHighlighting().stream()
                .filter(info -> info.forcedTextAttributesKey != null && keys.contains(info.forcedTextAttributesKey))
                .filter(info -> text == null || text.equals(info.getText()))
                .filter(info -> severity == null || severity.equals(info.getSeverity()))
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

    private void assertClassCategory(String superclassName, TextAttributesKey expectedKey) {
        configureJava("""
            class CustomThrowable extends %s {
            }

            class Example {
                private CustomThrowable exception;
            }
            """.formatted(superclassName));

        assertEquals(2, countHighlights(expectedKey, "CustomThrowable"));

        assertEquals(2, countClassHighlights("CustomThrowable"));
    }

    private void assertOnlyContextUsesJavaSource(ThrowableHighlightingContext selectedContext) {
        ThrowableHighlightingSettings.getInstance()
                .setHighlightingSource(selectedContext, ThrowableHighlightingSource.JAVA);

        configureIOExceptionContexts();
        List<HighlightInfo> highlights = myFixture.doHighlighting();

        for (ThrowableHighlightingContext context : ThrowableHighlightingContext.values()) {
            List<TextAttributesKey> keys = switch (context) {
                case CLASS -> CLASS_HIGHLIGHT_KEYS;
                case CATCH -> CATCH_HIGHLIGHT_KEYS;
                case IMPORT -> List.of(ThrowableHighlighting.THROWABLE_IMPORT);
                case THROWS -> List.of(ThrowableHighlighting.THROWABLE_THROWS);
                case JAVADOC -> List.of(ThrowableHighlighting.THROWABLE_JAVADOC);
            };

            long enabledCount = context == ThrowableHighlightingContext.CLASS ? 3 : 1;
            long actualCount = highlights.stream()
                    .filter(info -> info.forcedTextAttributesKey != null && keys.contains(info.forcedTextAttributesKey))
                    .count();

            assertEquals(context.name(), context == selectedContext ? 0 : enabledCount, actualCount);
        }
    }

    private void assertCatchCategory(String baseTypeName, TextAttributesKey expectedKey) {
        configureJava("""
        class BaseThrowable extends %s {
        }

        class CustomThrowable extends BaseThrowable {
        }

        class Example {
            void execute() {
                try {
                    throw new %s();
                } catch (%s direct) {
                }

                try {
                    throw new CustomThrowable();
                } catch (CustomThrowable inherited) {
                }
            }
        }
        """.formatted(baseTypeName, baseTypeName, baseTypeName));

        assertEquals(1, countHighlights(expectedKey, baseTypeName));
        assertEquals(1, countHighlights(expectedKey, "CustomThrowable"));
        assertEquals(2, countCatchHighlights());
    }
}
