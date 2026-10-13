package throwablehighlighter.fixture.usage;

import throwablehighlighter.fixture.exception.NestedException;

public class TransitiveContextFixture {

    private NestedException nestedException;

    public void execute() {
        try {
        } catch (NestedException exception) {
            NestedException copy = exception;
        }
    }
}
