package throwablehighlighter.fixture.usage;

import throwablehighlighter.fixture.exception.ExternalException;

public class CrossFileContextFixture {

    private ExternalException externalException;

    public void execute() {
        try {
        } catch (ExternalException exception) {
            ExternalException copy = exception;
        }
    }
}
