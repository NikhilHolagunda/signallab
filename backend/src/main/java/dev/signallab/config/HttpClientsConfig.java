package dev.signallab.config;

import java.net.http.HttpClient;
import java.time.Duration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

/** Outbound HTTP clients with sane timeouts (n8n, media worker, GitHub). */
@Configuration
public class HttpClientsConfig {

    @Bean
    RestClient.Builder outboundRestClientBuilder() {
        HttpClient http = HttpClient.newBuilder()
                // The JDK client tries an h2c upgrade on plain http://, which Node servers
                // (n8n) answer by cancelling the request. Internal hops are HTTP/1.1.
                .version(HttpClient.Version.HTTP_1_1)
                .connectTimeout(Duration.ofSeconds(5))
                .followRedirects(HttpClient.Redirect.NORMAL)
                .build();
        JdkClientHttpRequestFactory factory = new JdkClientHttpRequestFactory(http);
        factory.setReadTimeout(Duration.ofSeconds(60));
        return RestClient.builder().requestFactory(factory);
    }
}
