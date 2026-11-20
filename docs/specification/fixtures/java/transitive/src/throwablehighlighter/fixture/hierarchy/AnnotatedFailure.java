package throwablehighlighter.fixture.hierarchy;

import java.lang.annotation.ElementType;
import java.lang.annotation.Target;

@Target(ElementType.TYPE_USE)
@interface SuperclassType {}

public class AnnotatedFailure extends @SuperclassType RuntimeException {}
