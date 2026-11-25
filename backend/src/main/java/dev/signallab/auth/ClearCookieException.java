package dev.signallab.auth;

import dev.signallab.common.ApiException;
import org.springframework.http.ResponseCookie;

/** An auth failure that must also clear the refresh cookie on the way out. */
public class ClearCookieException extends RuntimeException {

    private final ApiException apiException;
    private final ResponseCookie clearCookie;

    public ClearCookieException(ApiException apiException, ResponseCookie clearCookie) {
        super(apiException.getMessage(), apiException);
        this.apiException = apiException;
        this.clearCookie = clearCookie;
    }

    public ApiException apiException() {
        return apiException;
    }

    public ResponseCookie clearCookie() {
        return clearCookie;
    }
}
