import java.io.IOException;

class ThrowsContextFixture {

    ThrowsContextFixture() throws IOException {
    }

    void execute() throws IOException, IllegalArgumentException {
        IOException copy = null;
    }
}