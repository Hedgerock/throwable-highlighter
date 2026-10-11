import java.io.IOException;

final class SyntaxPreservationFixture {

    // Throwable handling remains standard Java code.
    private IOException exception;

    public void execute() throws IOException {
        throw new IOException();
    }
}
