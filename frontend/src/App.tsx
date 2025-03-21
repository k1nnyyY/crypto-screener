import { useEffect, useState } from "react";
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
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001/api";

  useEffect(() => {
    console.log("🔴 Error message updated:", errorMessage);
  }, [errorMessage]);
  
  
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

  const handleAction = async () => {
    setErrorMessage(null);
    setLoading(true);
    setProgress(20);

    try {
      const endpoint = collapsed ? "/reset" : "/setup";
      const payload = collapsed
        ? { servers }
        : {
            server_count: serverCount,
            servers,
            shadowsocks,
            hosts: hosts.split("\n"),
          };

      console.log(`🚀 Отправка запроса на ${endpoint}:`, payload);

      const response = await fetch(`${API_URL}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      setProgress(50);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error("❌ Ошибка от бэка:", errorText);
        setErrorMessage(`Ошибка запроса: ${response.status} - ${errorText}`);
        return;
      }

      const result = await response.json();
      console.log(`✅ Ответ от ${endpoint}:`, result);

      if (!result || result.status === "error") {
        console.error("❌ Ошибка в ответе:", result);
        setErrorMessage(
          result.results?.map((r: any) => `${r.ip}: ${r.message}`).join("\n") ||
            "Неизвестная ошибка"
        );
        return;
      }
      setResult(result);
      setProgress(100);
    } catch (error: any) {
      console.error("❌ Ошибка запроса:", error);
      setErrorMessage(error.message || "Произошла ошибка!");
    } finally {
      setLoading(false);
    }
  };

  const handleClearInputs = () => {
    setServerCount(1);
    setServers([{ ip: "", password: "" }]);
    setShadowsocks({ password: "", port: "" });
    setHosts("");
    setLoading(false);
    setProgress(0);
    setResult(null);
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

        <NumberInput
          label="Количество серверов"
          value={serverCount}
          onChange={handleServerCountChange}
          min={1}
          max={10}
          required
          mb="md"
        />
        {servers.map((server, index) => (
          <Group key={index} grow>
            <TextInput
              label={`IP Сервер ${index + 1}`}
              value={server.ip}
              onChange={(e) => handleServerChange(index, "ip", e.target.value)}
              required
            />
            <TextInput
              label={`Пароль Сервер ${index + 1}`}
              type="password"
              value={server.password}
              onChange={(e) =>
                handleServerChange(index, "password", e.target.value)
              }
              required
            />
          </Group>
        ))}

        {!collapsed && (
          <>
            <TextInput
              label="Пароль Shadowsocks"
              value={shadowsocks.password}
              onChange={(e) =>
                setShadowsocks({ ...shadowsocks, password: e.target.value })
              }
              required
              mt="md"
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
            />
            <Textarea
              label="Hosts (по строкам)"
              minRows={3}
              value={hosts}
              onChange={(e) => setHosts(e.target.value)}
              placeholder="example.com\napi.example.com"
              mt="md"
            />
          </>
        )}

        {loading && <Loader size="lg" mt="md" />}
        {loading && <Progress value={progress} mt="sm" />}

        <Group mt="md">
          <Button onClick={handleAction} disabled={loading} color="green">
            {collapsed ? "Сбросить" : "Настроить"}
          </Button>
          <Button color="gray" onClick={() => setCollapsed(!collapsed)}>
            {collapsed ? "Развернуть" : "Свернуть"}
          </Button>
          <Button onClick={handleClearInputs} color="red">
            Очистить
          </Button>
        </Group>
        {errorMessage && (
          <Card shadow="sm" mt="md" withBorder style={{ borderColor: "red" }}>
            <Title order={4} style={{ color: "red" }}>
              Ошибка
            </Title>
            <pre style={{ whiteSpace: "pre-wrap", color: "red" }}>
              {errorMessage}
            </pre>
          </Card>
        )}

        {result && (
          <Card shadow="sm" mt="md" withBorder>
            <Title order={4}>Результат</Title>
            <pre style={{ whiteSpace: "pre-wrap" }}>
              {JSON.stringify(result, null, 2)}
            </pre>
          </Card>
        )}
      </Paper>
    </Container>
  );
}

export default App;
