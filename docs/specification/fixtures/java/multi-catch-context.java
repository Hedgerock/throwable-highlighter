class MultiCatchContextFixture {

    void execute() {
        try {
        } catch (IllegalArgumentException | IllegalStateException exception) {
        }
    }
}
