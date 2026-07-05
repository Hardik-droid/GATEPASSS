FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src

COPY GatepassApi/GatepassApi.csproj GatepassApi/
RUN dotnet restore GatepassApi/GatepassApi.csproj

COPY GatepassApi/ GatepassApi/
RUN dotnet publish GatepassApi/GatepassApi.csproj -c Release -o /app/publish /p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS runtime
WORKDIR /app

COPY --from=build /app/publish ./

ENTRYPOINT ["sh", "-c", "dotnet GatepassApi.dll --urls http://0.0.0.0:${PORT:-8080}"]
