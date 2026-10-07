package io.github.hedgerock.throwablehighlighter;

import com.intellij.lang.annotation.AnnotationHolder;
import com.intellij.lang.annotation.Annotator;
import com.intellij.psi.PsiClass;
import com.intellij.psi.PsiElement;
import com.intellij.psi.PsiIdentifier;
import com.intellij.psi.PsiImportStatement;
import com.intellij.psi.PsiJavaCodeReferenceElement;
import com.intellij.psi.util.InheritanceUtil;
import com.intellij.psi.util.PsiTreeUtil;
import org.jetbrains.annotations.NotNull;

public final class ThrowableAnnotator implements Annotator {

    @Override
    public void annotate(
            @NotNull PsiElement psiElement,
            @NotNull AnnotationHolder annotationHolder
    ) {
        if (psiElement instanceof PsiImportStatement importStatement) {
            annotateImport(importStatement, annotationHolder);
            return;
        }

        if (psiElement instanceof  PsiJavaCodeReferenceElement referenceElement) {
            if (PsiTreeUtil.getParentOfType(
                    referenceElement,
                    PsiImportStatement.class,
                    false
            ) != null) {
                return;
            }

            annotateReference(referenceElement, annotationHolder);
            return;
        }

        if (psiElement instanceof PsiClass psiClass) {
            annotateDeclaration(psiClass, annotationHolder);
        }
    }

    private void annotateImport(
            PsiImportStatement importStatement,
            AnnotationHolder annotationHolder
    ) {
        if (importStatement.isOnDemand()) {
            return;
        }

        PsiElement resolved = importStatement.resolve();

        if (!(resolved instanceof PsiClass psiClass)) {
            return;
        }

        PsiJavaCodeReferenceElement importReference =
                importStatement.getImportReference();

        if (importReference == null) {
            return;
        }

        PsiElement className = importReference.getReferenceNameElement();

        if (className == null) {
            return;
        }

        annotateThrowableType(
                psiClass,
                className,
                ThrowableHighlightingContext.IMPORT,
                annotationHolder
        );
    }

    private void annotateDeclaration(
            PsiClass psiClass,
            AnnotationHolder annotationHolder
    ) {
        PsiIdentifier identifier = psiClass.getNameIdentifier();

        if (identifier == null) {
            return;
        }

        annotateThrowableType(
                psiClass,
                identifier,
                ThrowableHighlightingContext.CLASS,
                annotationHolder
        );
    }

    private void annotateReference(
            PsiJavaCodeReferenceElement referenceElement,
            AnnotationHolder annotationHolder
    ) {
        PsiElement resolved = referenceElement.resolve();

        if (!(resolved instanceof PsiClass psiClass)) {
            return;
        }

        annotateThrowableType(
                psiClass,
                referenceElement,
                ThrowableHighlightingContext.CLASS,
                annotationHolder
        );
    }

    private void annotateThrowableType(
            PsiClass psiClass,
            PsiElement range,
            ThrowableHighlightingContext context,
            AnnotationHolder annotationHolder
    ) {
        if (!isThrowableType(psiClass)) {
            return;
        }

        applyHighlight(range, context, annotationHolder);
    }

    private void applyHighlight(
            PsiElement range,
            ThrowableHighlightingContext context,
            AnnotationHolder annotationHolder
    ) {
        annotationHolder.newSilentAnnotation(context.getSeverity())
                .range(range)
                .textAttributes(context.getTextAttributesKey())
                .create();
    }

    private boolean isThrowableType(PsiClass psiClass) {
        return InheritanceUtil.isInheritor(
                psiClass,
                Throwable.class.getName()
        );
    }
}
