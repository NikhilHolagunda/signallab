package dev.signallab.common;

import java.net.URI;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.ProblemDetail;

/** Small factory so every problem+json body has the same shape. */
public final class Problems {

    private static final String TYPE_BASE = "https://signallab.dev/problems/";

    private Problems() {}

    public static ProblemDetail of(HttpStatusCode status, String code, String detail) {
        ProblemDetail pd = ProblemDetail.forStatusAndDetail(status, detail);
        pd.setType(URI.create(TYPE_BASE + code));
        pd.setProperty("code", code);
        return pd;
    }
}
