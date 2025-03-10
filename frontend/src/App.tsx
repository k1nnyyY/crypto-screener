import { useState } from "react";
import {
  NumberInput,
  TextInput,
  Textarea,
  Button,
  Group,
  Loader,
  Progress,
  Card,
  Title,
  Paper,
  Container,
  Divider,
} from "@mantine/core";

function App() {
  const [serverCount, setServerCount] = useState(1);
  const [servers, setServers] = useState([{ ip: "", password: "" }]);
  const [shadowsocks, setShadowsocks] = useState({ password: "", port: "" });
  const [hosts, setHosts] = useState("");
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState(null);
  const [collapsed, setCollapsed] = useState(false);

  const handleServerCountChange = (value: string | number) => {
    const parsedValue = typeof value === "string" ? parseInt(value, 10) : value;
    if (isNaN(parsedValue) || parsedValue < 1) return;

    setServerCount(parsedValue);
    setServers(
      Array.from({ length: parsedValue }, () => ({ ip: "", password: "" }))
    );
  };

  const handleServerChange = (
    index: number,
    field: "ip" | "password",
    value: string
  ) => {
    const newServers = [...servers];
    newServers[index][field] = value;
    setServers(newServers);
  };

  const handleSetup = async () => {
    setLoading(true);
    setProgress(20);
    try {
      const response = await fetch("http://localhost:3000/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          server_count: serverCount,
          servers,
          shadowsocks,
          hosts: hosts.split("\n"),
        }),
      });
      setProgress(80);
      const result = await response.json();
      setResult(result);
      setProgress(100);
    } catch (error) {
      console.error("Setup failed:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container
      size={600}
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        height: "100vh",
      }}
    >
      <Paper
        shadow="xl"
        p="xl"
        radius="lg"
        withBorder
        style={{ backgroundColor: "#f9f9f9" }}
      >
        <Title
          order={2}
          mb="md"
          style={{ fontWeight: "bold", fontSize: "24px" }}
        >
          ⚙️ Настройка серверов
        </Title>
        <Divider mb="md" />

        {collapsed ? (
          <Button
            fullWidth
            variant="light"
            onClick={() => setCollapsed(false)}
            style={{ fontSize: "16px" }}
          >
            Развернуть
          </Button>
        ) : (
          <>
            <NumberInput
              label="Количество серверов"
              value={serverCount}
              onChange={handleServerCountChange}
              min={1}
              max={10}
              required
              mb="md"
              styles={{
                input: {
                  borderRadius: "6px",
                  border: "1px solid #ccc",
                  fontSize: "16px",
                },
              }}
            />
            {servers.map((server, index) => (
              <Group key={index} grow>
                <TextInput
                  label={`IP Сервер ${index + 1}`}
                  value={server.ip}
                  onChange={(e) =>
                    handleServerChange(index, "ip", e.target.value)
                  }
                  required
                  styles={{
                    input: {
                      borderRadius: "6px",
                      border: "1px solid #ccc",
                      fontSize: "16px",
                    },
                  }}
                />
                <TextInput
                  label={`Пароль Сервер ${index + 1}`}
                  type="password"
                  value={server.password}
                  onChange={(e) =>
                    handleServerChange(index, "password", e.target.value)
                  }
                  required
                  styles={{
                    input: {
                      borderRadius: "6px",
                      border: "1px solid #ccc",
                      fontSize: "16px",
                    },
                  }}
                />
              </Group>
            ))}
            <TextInput
              label="Пароль Shadowsocks"
              value={shadowsocks.password}
              onChange={(e) =>
                setShadowsocks({ ...shadowsocks, password: e.target.value })
              }
              required
              mt="md"
              styles={{
                input: {
                  borderRadius: "6px",
                  border: "1px solid #ccc",
                  fontSize: "16px",
                },
              }}
            />
            <TextInput
              label="Порт Shadowsocks"
              type="number"
              value={shadowsocks.port}
              onChange={(e) =>
                setShadowsocks({ ...shadowsocks, port: e.target.value })
              }
              required
              mt="md"
              styles={{
                input: {
                  borderRadius: "6px",
                  border: "1px solid #ccc",
                  fontSize: "16px",
                },
              }}
            />
            <Textarea
              label="Hosts (по строкам)"
              minRows={3}
              value={hosts}
              onChange={(e) => setHosts(e.target.value)}
              placeholder="example.com\napi.example.com"
              mt="md"
              styles={{
                input: {
                  borderRadius: "6px",
                  border: "1px solid #ccc",
                  fontSize: "16px",
                },
              }}
            />
            {loading && <Loader size="lg" mt="md" />}
            {loading && <Progress value={progress} mt="sm" />}

            <Group mt="md">
              <Button
                onClick={handleSetup}
                disabled={loading}
                color="green"
                style={{
                  fontSize: "16px",
                  borderRadius: "8px",
                  backgroundColor: "#28a745",
                }}
              >
                Настроить
              </Button>
              <Button
                color="gray"
                onClick={() => setCollapsed(true)}
                style={{
                  fontSize: "16px",
                  borderRadius: "8px",
                  backgroundColor: "#6c757d",
                }}
              >
                Свернуть
              </Button>
              <Button
                color="red"
                onClick={() => {
                  setServerCount(1);
                  setServers([{ ip: "", password: "" }]);
                  setShadowsocks({ password: "", port: "" });
                  setHosts("");
                  setLoading(false);
                  setProgress(0);
                  setResult(null);
                  setCollapsed(false);
                }}
                style={{
                  fontSize: "16px",
                  borderRadius: "8px",
                  backgroundColor: "#dc3545",
                }}
              >
                Сброс
              </Button>
            </Group>
          </>
        )}

        {result && (
          <Card shadow="sm" mt="md" withBorder>
            <Title order={4}>Результат</Title>
            <pre
              style={{
                whiteSpace: "pre-wrap",
                fontFamily: "monospace",
                fontSize: "14px",
              }}
            >
              {JSON.stringify(result, null, 2)}
            </pre>
          </Card>
        )}
      </Paper>
    </Container>
  );
}

export default App;
