class CatchContextFixture {

    void execute() {
        try {
        } catch (RuntimeException exception) {
            RuntimeException copy = exception;
        }
    }
}
