class CustomException extends RuntimeException {

}

class ClassContextFixture {

    private CustomException field;
    private Throwable throwable;

    void execute(CustomException parameter) {
        CustomException local = new CustomException();
    }
}
